import hashlib
import json
import os
import re
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime

import networkx as nx
import numpy as np
import ollama
from docx import Document
from pypdf import PdfReader
from rank_bm25 import BM25Okapi
from sentence_transformers import SentenceTransformer

try:
    import faiss
except Exception:
    faiss = None

try:
    from sentence_transformers import CrossEncoder
except Exception:
    CrossEncoder = None


def _extract_text_from_path(filepath):
    ext = os.path.splitext(filepath)[1].lower()
    content = ""
    try:
        if ext in [".txt", ".md", ".py", ".json"]:
            with open(filepath, "r", encoding="utf-8", errors="ignore") as f:
                content = f.read()
        elif ext == ".pdf":
            with open(filepath, "rb") as f:
                reader = PdfReader(f)
                for page in reader.pages:
                    page_text = page.extract_text()
                    if page_text:
                        content += page_text + "\n"
        elif ext == ".docx":
            doc = Document(filepath)
            content = "\n".join(p.text for p in doc.paragraphs)
    except Exception as error:
        print(f"Error reading {filepath}: {error}")
    return content


class FileProcessor:
    @staticmethod
    def get_file_hash(filepath):
        return hashlib.md5(filepath.encode("utf-8")).hexdigest()

    @staticmethod
    def extract_text(filepath):
        return _extract_text_from_path(filepath)


class SemanticMemory:
    """Core Engine: Indexing, Graph Construction, and Hybrid Search."""

    def __init__(self, root_directory):
        self.root_directory = root_directory
        self.model_name = os.getenv("SEMANTIC_EMBED_MODEL", "BAAI/bge-small-en")
        self.chunk_size = int(os.getenv("SEMANTIC_CHUNK_SIZE", "300"))
        self.chunk_overlap = int(os.getenv("SEMANTIC_CHUNK_OVERLAP", "50"))
        self.enable_rerank = os.getenv("SEMANTIC_ENABLE_RERANK", "0") == "1"
        self.enable_llm_intent = os.getenv("SEMANTIC_ENABLE_LLM_INTENT", "1") == "1"
        self.cache_dir = os.path.join(self.root_directory, ".semantic_cache")
        self.cache_manifest = os.path.join(self.cache_dir, "manifest.json")
        self.cache_documents = os.path.join(self.cache_dir, "documents.json")
        self.cache_chunks = os.path.join(self.cache_dir, "chunks.json")
        self.cache_chunk_embeddings = os.path.join(self.cache_dir, "chunk_embeddings.npy")
        self.cache_doc_embeddings = os.path.join(self.cache_dir, "doc_embeddings.npy")
        self.cache_graph = os.path.join(self.cache_dir, "graph.json")
        self.cache_faiss = os.path.join(self.cache_dir, "faiss.index")
        self.cache_intent = os.path.join(self.cache_dir, "intent_cache.json")
        os.makedirs(self.cache_dir, exist_ok=True)

        print(">>> Loading AI Models...")
        self.encoder = SentenceTransformer(self.model_name)
        self.reranker = None

        self.graph = nx.DiGraph()
        self.pagerank_scores = {}
        self.documents = {}
        self.vectors = {}
        self.chunks = []
        self.chunk_embeddings = None
        self.doc_ids_in_order = []
        self.chunk_parent_ids = []
        self.chunk_texts = []
        self.bm25 = None
        self.bm25_chunk_ids = []
        self.faiss_index = None
        self.intent_cache = self._load_intent_cache()

        self.index_files()

    def _load_intent_cache(self):
        if os.path.exists(self.cache_intent):
            try:
                with open(self.cache_intent, "r", encoding="utf-8") as file:
                    payload = json.load(file)
                    if isinstance(payload, dict):
                        return payload
            except Exception:
                return {}
        return {}

    def _save_intent_cache(self):
        try:
            with open(self.cache_intent, "w", encoding="utf-8") as file:
                json.dump(self.intent_cache, file, ensure_ascii=False, indent=2)
        except Exception:
            pass

    def _iter_supported_files(self):
        supported = {".txt", ".md", ".pdf", ".docx", ".py", ".json"}
        for root, _, files in os.walk(self.root_directory):
            if ".semantic_cache" in root:
                continue
            for filename in files:
                if filename.startswith("~$") or filename.startswith("."):
                    continue
                ext = os.path.splitext(filename)[1].lower()
                if ext in supported:
                    yield os.path.join(root, filename)

    def _compute_corpus_signature(self, files):
        entries = []
        for path in files:
            try:
                stat = os.stat(path)
                entries.append(
                    {
                        "path": os.path.relpath(path, self.root_directory).replace("\\", "/"),
                        "size": stat.st_size,
                        "mtime": int(stat.st_mtime),
                    }
                )
            except FileNotFoundError:
                continue
        entries.sort(key=lambda item: item["path"])
        raw = json.dumps(entries, sort_keys=True).encode("utf-8")
        return hashlib.md5(raw).hexdigest()

    def _extract_metadata(self, path, text, mod_time):
        filename = os.path.basename(path)
        ext = os.path.splitext(filename)[1].lower().lstrip(".")
        date_match = re.search(r"(\d{4}-\d{2}-\d{2}|\d{2}/\d{2}/\d{4})", text)
        extracted_date = date_match.group(1) if date_match else mod_time[:10]
        doc_type = "general"
        if "invoice" in filename.lower() or "invoice" in text[:2000].lower():
            doc_type = "invoice"
        elif "resume" in filename.lower() or "cv" in filename.lower():
            doc_type = "resume"
        elif "meeting" in filename.lower() or "minutes" in filename.lower():
            doc_type = "meeting_notes"
        elif "spec" in filename.lower():
            doc_type = "specification"
        return {
            "date": extracted_date,
            "type": doc_type,
            "extension": ext,
        }

    def _chunk_text(self, text):
        cleaned = re.sub(r"\s+", " ", text).strip()
        if not cleaned:
            return []
        step = max(1, self.chunk_size - self.chunk_overlap)
        return [cleaned[i : i + self.chunk_size] for i in range(0, len(cleaned), step)]

    def _load_cached_artifacts(self, expected_signature):
        required = [
            self.cache_manifest,
            self.cache_documents,
            self.cache_chunks,
            self.cache_chunk_embeddings,
            self.cache_doc_embeddings,
            self.cache_graph,
        ]
        if not all(os.path.exists(path) for path in required):
            return False

        try:
            with open(self.cache_manifest, "r", encoding="utf-8") as file:
                manifest = json.load(file)
            if (
                manifest.get("signature") != expected_signature
                or manifest.get("model") != self.model_name
                or manifest.get("chunk_size") != self.chunk_size
                or manifest.get("chunk_overlap") != self.chunk_overlap
            ):
                return False

            with open(self.cache_documents, "r", encoding="utf-8") as file:
                payload_docs = json.load(file)
            self.documents = {doc["id"]: doc for doc in payload_docs}
            self.doc_ids_in_order = [doc["id"] for doc in payload_docs]

            with open(self.cache_chunks, "r", encoding="utf-8") as file:
                self.chunks = json.load(file)
            self.chunk_parent_ids = [item["parent_id"] for item in self.chunks]
            self.chunk_texts = [item["text"] for item in self.chunks]
            self.bm25_chunk_ids = [item["chunk_id"] for item in self.chunks]

            chunk_tokens = [item.get("tokens", []) for item in self.chunks]
            self.bm25 = BM25Okapi(chunk_tokens) if chunk_tokens else None

            self.chunk_embeddings = np.load(self.cache_chunk_embeddings)
            doc_embeddings = np.load(self.cache_doc_embeddings)
            self.vectors = {
                doc_id: doc_embeddings[idx]
                for idx, doc_id in enumerate(self.doc_ids_in_order)
                if idx < len(doc_embeddings)
            }

            with open(self.cache_graph, "r", encoding="utf-8") as file:
                graph_payload = json.load(file)
            self.graph = nx.node_link_graph(graph_payload, edges="links")
            self.pagerank_scores = nx.pagerank(self.graph) if self.graph.number_of_nodes() else {}

            if faiss is not None and os.path.exists(self.cache_faiss):
                self.faiss_index = faiss.read_index(self.cache_faiss)
            else:
                self._build_faiss_index()

            print(f">>> Loaded cached artifacts for {len(self.documents)} documents.")
            return True
        except Exception as error:
            print(f"Cache load failed, rebuilding index: {error}")
            return False

    def _save_cached_artifacts(self, signature):
        doc_list = [self.documents[doc_id] for doc_id in self.doc_ids_in_order]
        with open(self.cache_documents, "w", encoding="utf-8") as file:
            json.dump(doc_list, file, ensure_ascii=False, indent=2)

        with open(self.cache_chunks, "w", encoding="utf-8") as file:
            json.dump(self.chunks, file, ensure_ascii=False, indent=2)

        np.save(self.cache_chunk_embeddings, self.chunk_embeddings)

        doc_matrix = np.array([self.vectors[doc_id] for doc_id in self.doc_ids_in_order], dtype=np.float32)
        np.save(self.cache_doc_embeddings, doc_matrix)

        graph_payload = nx.node_link_data(self.graph, edges="links")
        with open(self.cache_graph, "w", encoding="utf-8") as file:
            json.dump(graph_payload, file)

        if faiss is not None and self.faiss_index is not None:
            faiss.write_index(self.faiss_index, self.cache_faiss)

        manifest = {
            "signature": signature,
            "model": self.model_name,
            "chunk_size": self.chunk_size,
            "chunk_overlap": self.chunk_overlap,
            "updated": datetime.utcnow().isoformat(),
        }
        with open(self.cache_manifest, "w", encoding="utf-8") as file:
            json.dump(manifest, file, indent=2)

    def _build_faiss_index(self):
        self.faiss_index = None
        if faiss is None or self.chunk_embeddings is None or len(self.chunk_embeddings) == 0:
            return
        dim = int(self.chunk_embeddings.shape[1])
        self.faiss_index = faiss.IndexFlatIP(dim)
        matrix = np.array(self.chunk_embeddings, dtype=np.float32)
        faiss.normalize_L2(matrix)
        self.faiss_index.add(matrix)

    def index_files(self):
        print(">>> Scanning and Indexing files...")
        files = sorted(list(self._iter_supported_files()))
        signature = self._compute_corpus_signature(files)
        if self._load_cached_artifacts(signature):
            return

        self.documents = {}
        self.vectors = {}
        self.chunks = []
        self.doc_ids_in_order = []
        self.chunk_parent_ids = []
        self.chunk_texts = []
        self.bm25_chunk_ids = []

        workers = min(max(1, (os.cpu_count() or 4) - 1), 8)
        with ThreadPoolExecutor(max_workers=workers) as executor:
            texts = list(executor.map(_extract_text_from_path, files))

        for filepath, text in zip(files, texts):
            filename = os.path.basename(filepath)
            if not text.strip():
                text = filename.replace("_", " ").replace(".", " ")

            stat = os.stat(filepath)
            mod_time = datetime.fromtimestamp(stat.st_mtime).isoformat()
            file_id = FileProcessor.get_file_hash(filepath)
            metadata = self._extract_metadata(filepath, text, mod_time)

            doc_payload = {
                "id": file_id,
                "path": filepath,
                "filename": filename,
                "preview": text[:500],
                "mod_time": mod_time,
                "folder": os.path.dirname(filepath),
                "metadata": metadata,
            }
            self.documents[file_id] = doc_payload
            self.doc_ids_in_order.append(file_id)

            chunks = self._chunk_text(text)
            if not chunks:
                chunks = [filename]

            for chunk_index, chunk_text in enumerate(chunks):
                chunk_id = f"{file_id}::{chunk_index}"
                tokens = re.findall(r"\w+", chunk_text.lower())
                self.chunks.append(
                    {
                        "chunk_id": chunk_id,
                        "parent_id": file_id,
                        "text": chunk_text,
                        "tokens": tokens,
                    }
                )
                self.chunk_parent_ids.append(file_id)
                self.chunk_texts.append(chunk_text)
                self.bm25_chunk_ids.append(chunk_id)

        if self.chunks:
            chunk_tokens = [item["tokens"] for item in self.chunks]
            self.bm25 = BM25Okapi(chunk_tokens)
            encoded_chunks = self.encoder.encode(
                self.chunk_texts,
                batch_size=32,
                show_progress_bar=False,
                normalize_embeddings=True,
            )
            self.chunk_embeddings = np.array(encoded_chunks, dtype=np.float32)
        else:
            self.bm25 = None
            self.chunk_embeddings = np.array([], dtype=np.float32)

        self._build_faiss_index()

        for doc_id in self.doc_ids_in_order:
            indices = [i for i, parent_id in enumerate(self.chunk_parent_ids) if parent_id == doc_id]
            if not indices:
                continue
            doc_matrix = self.chunk_embeddings[indices]
            self.vectors[doc_id] = np.mean(doc_matrix, axis=0)

        print(f">>> Indexed {len(self.documents)} documents and {len(self.chunks)} chunks.")
        self.build_graph()
        self._save_cached_artifacts(signature)

    def build_graph(self):
        print(">>> Building Relationship Graph...")
        self.graph = nx.DiGraph()
        for file_id, doc in self.documents.items():
            self.graph.add_node(file_id, label=doc["filename"], type="file")

        doc_ids = list(self.documents.keys())
        for i, file_id in enumerate(doc_ids):
            doc = self.documents[file_id]
            for j in range(i + 1, len(doc_ids)):
                other_id = doc_ids[j]
                other_doc = self.documents[other_id]

                if doc["folder"] == other_doc["folder"]:
                    self.graph.add_edge(file_id, other_id, relation="CO_LOCATED")
                    self.graph.add_edge(other_id, file_id, relation="CO_LOCATED")

                name_a = os.path.splitext(doc["filename"])[0].lower()
                name_b = os.path.splitext(other_doc["filename"])[0].lower()
                clean_a = re.sub(r"(_v\d+|_draft|_final)", "", name_a)
                clean_b = re.sub(r"(_v\d+|_draft|_final)", "", name_b)
                if clean_a == clean_b or clean_a in clean_b or clean_b in clean_a:
                    if doc["mod_time"] < other_doc["mod_time"]:
                        self.graph.add_edge(file_id, other_id, relation="VERSION_OF")
                    else:
                        self.graph.add_edge(other_id, file_id, relation="VERSION_OF")

                vec_a = self.vectors.get(file_id)
                vec_b = self.vectors.get(other_id)
                if vec_a is None or vec_b is None:
                    continue
                similarity = float(np.dot(vec_a, vec_b))
                if similarity > 0.75:
                    self.graph.add_edge(file_id, other_id, relation="RELATED_TO", weight=similarity)
                    self.graph.add_edge(other_id, file_id, relation="RELATED_TO", weight=similarity)

        self.pagerank_scores = nx.pagerank(self.graph) if self.graph.number_of_nodes() else {}
        print(f">>> Graph built: {self.graph.number_of_nodes()} nodes, {self.graph.number_of_edges()} edges.")

    def _should_use_llm_intent(self, query):
        triggers = ["latest", "version", "recent", "pdf", "docx", "invoice", "resume", "meeting"]
        lowered = query.lower()
        return any(trigger in lowered for trigger in triggers)

    def _heuristic_intent(self, query):
        lowered = query.lower()
        compact = re.sub(r"\s+", " ", lowered).strip()

        inferred_type = None
        if any(token in compact for token in ["resume", "cv"]):
            inferred_type = "resume"
        elif "invoice" in compact:
            inferred_type = "invoice"
        elif any(token in compact for token in ["meeting", "minutes"]):
            inferred_type = "meeting_notes"
        elif any(token in compact for token in ["spec", "specs", "specification"]):
            inferred_type = "specification"

        date_tokens = ["latest", "newest", "recent", "most recent", "last", "final"]
        sort_by = "date" if any(token in compact for token in date_tokens) else "relevance"

        cleaned = re.sub(r"\b(latest|newest|recent|most recent|last|final|version)\b", " ", compact)
        cleaned = re.sub(r"\s+", " ", cleaned).strip()
        if not cleaned:
            cleaned = compact

        return {
            "keywords": [cleaned],
            "file_type": None,
            "doc_type": inferred_type,
            "sort_by": sort_by,
            "prefer_latest_version": sort_by == "date" and inferred_type is not None,
        }

    def parse_intent(self, query):
        normalized_query = query.strip().lower()
        if normalized_query in self.intent_cache:
            return self.intent_cache[normalized_query]

        default_intent = {"keywords": [query], "file_type": None, "sort_by": "relevance"}
        if not self.enable_llm_intent or not self._should_use_llm_intent(query):
            self.intent_cache[normalized_query] = default_intent
            return default_intent

        prompt = f"""
Analyze search query: "{query}"
Return ONLY JSON with keys:
- keywords: list[str]
- file_type: string or null
- sort_by: "date" or "relevance"
"""
        try:
            response = ollama.chat(model="phi3:mini", messages=[{"role": "user", "content": prompt}])
            content = response["message"]["content"].replace("```json", "").replace("```", "").strip()
            start = content.find("{")
            end = content.rfind("}")
            if start != -1 and end != -1:
                parsed = json.loads(content[start : end + 1])
                intent = {
                    "keywords": parsed.get("keywords") or [query],
                    "file_type": parsed.get("file_type"),
                    "sort_by": parsed.get("sort_by", "relevance"),
                }
                self.intent_cache[normalized_query] = intent
                self._save_intent_cache()
                return intent
        except Exception:
            pass

        self.intent_cache[normalized_query] = default_intent
        return default_intent

    def _semantic_scores(self, query_embedding, top_k=20):
        scores = {}
        if self.chunk_embeddings is None or len(self.chunk_embeddings) == 0:
            return scores

        if self.faiss_index is not None:
            q = np.array([query_embedding], dtype=np.float32)
            if faiss is not None:
                faiss.normalize_L2(q)
            distances, indices = self.faiss_index.search(q, min(top_k, len(self.chunk_embeddings)))
            for score, idx in zip(distances[0], indices[0]):
                if idx < 0:
                    continue
                doc_id = self.chunk_parent_ids[idx]
                scores[doc_id] = max(scores.get(doc_id, 0.0), float(score))
            return scores

        sims = np.dot(self.chunk_embeddings, query_embedding)
        ranked = np.argsort(-sims)[:top_k]
        for idx in ranked:
            doc_id = self.chunk_parent_ids[idx]
            scores[doc_id] = max(scores.get(doc_id, 0.0), float(sims[idx]))
        return scores

    def _bm25_scores(self, raw_keywords):
        doc_scores = {}
        if not self.bm25:
            return doc_scores

        query_tokens = re.findall(r"\w+", raw_keywords.lower())
        if not query_tokens:
            return doc_scores

        chunk_scores = self.bm25.get_scores(query_tokens)
        max_score = float(np.max(chunk_scores)) if len(chunk_scores) else 1.0
        if max_score <= 0:
            max_score = 1.0

        for idx, score in enumerate(chunk_scores):
            doc_id = self.chunk_parent_ids[idx]
            normalized = float(score) / max_score
            doc_scores[doc_id] = max(doc_scores.get(doc_id, 0.0), normalized)
        return doc_scores

    def _load_reranker(self):
        if not self.enable_rerank or CrossEncoder is None:
            return None
        if self.reranker is None:
            self.reranker = CrossEncoder("cross-encoder/ms-marco-MiniLM-L-6-v2")
        return self.reranker

    def hybrid_search(self, query_text):
        intent = self.parse_intent(query_text)
        heuristic = self._heuristic_intent(query_text)

        merged_keywords = intent.get("keywords") or heuristic.get("keywords") or [query_text]
        raw_keywords = " ".join(merged_keywords).strip() or query_text

        inferred_doc_type = heuristic.get("doc_type")
        if inferred_doc_type is None:
            requested_ext = intent.get("file_type")
            ext_to_type = {
                "pdf": "resume",
                "docx": "resume",
                "txt": None,
            }
            inferred_doc_type = ext_to_type.get((requested_ext or "").lower().lstrip("."))

        sort_by = intent.get("sort_by") if intent.get("sort_by") in {"date", "relevance"} else heuristic.get("sort_by", "relevance")
        prefer_latest_version = bool(heuristic.get("prefer_latest_version"))

        scores = {doc_id: 0.0 for doc_id in self.documents}
        debug_scores = {doc_id: {} for doc_id in self.documents}

        query_embedding = self.encoder.encode(raw_keywords, normalize_embeddings=True)
        semantic_map = self._semantic_scores(query_embedding, top_k=30)
        bm25_map = self._bm25_scores(raw_keywords)

        stop_words = {
            "the",
            "a",
            "an",
            "my",
            "for",
            "to",
            "of",
            "latest",
            "newest",
            "recent",
            "version",
            "find",
            "show",
            "me",
        }
        significant_tokens = [
            token
            for token in re.findall(r"\w+", raw_keywords.lower())
            if token not in stop_words and len(token) > 1
        ]

        doc_times = [datetime.fromisoformat(doc["mod_time"]).timestamp() for doc in self.documents.values()]
        min_ts = min(doc_times) if doc_times else 0.0
        max_ts = max(doc_times) if doc_times else 1.0
        ts_span = max(max_ts - min_ts, 1.0)

        for doc_id in scores:
            semantic_component = semantic_map.get(doc_id, 0.0) * 0.3
            bm25_component = bm25_map.get(doc_id, 0.0) * 0.55
            graph_component = self.pagerank_scores.get(doc_id, 0.0) * 0.1

            score = semantic_component + bm25_component + graph_component

            doc = self.documents[doc_id]
            metadata_boost = 0.0
            requested_ext = intent.get("file_type")
            if requested_ext:
                ext_value = requested_ext.lower().lstrip(".")
                if doc["metadata"].get("extension") == ext_value:
                    metadata_boost += 0.08
                else:
                    metadata_boost -= 0.02

            if inferred_doc_type:
                if doc["metadata"].get("type") == inferred_doc_type:
                    metadata_boost += 0.28
                else:
                    metadata_boost -= 0.14

            filename_lower = doc["filename"].lower()
            preview_lower = (doc.get("preview") or "").lower()
            token_hits = sum(1 for token in significant_tokens if token in filename_lower or token in preview_lower)
            token_coverage = (token_hits / len(significant_tokens)) if significant_tokens else 0.0
            lexical_component = token_coverage * 0.2
            if significant_tokens and token_hits == 0:
                lexical_component -= 0.25

            recency_component = 0.0
            if sort_by == "date":
                timestamp = datetime.fromisoformat(doc["mod_time"]).timestamp()
                recency_component = ((timestamp - min_ts) / ts_span) * 0.12

            version_component = 0.0
            if prefer_latest_version and inferred_doc_type and doc["metadata"].get("type") == inferred_doc_type:
                incoming_version = 0
                outgoing_version = 0
                for source, target, attrs in self.graph.in_edges(doc_id, data=True):
                    if attrs.get("relation") == "VERSION_OF" and target == doc_id:
                        incoming_version += 1
                for source, target, attrs in self.graph.out_edges(doc_id, data=True):
                    if attrs.get("relation") == "VERSION_OF" and source == doc_id:
                        outgoing_version += 1

                if incoming_version > 0 and outgoing_version == 0:
                    version_component += 0.18
                elif outgoing_version > 0:
                    version_component -= 0.08

            score += metadata_boost + lexical_component + recency_component + version_component
            scores[doc_id] = score
            debug_scores[doc_id] = {
                "bm25": round(bm25_component, 3),
                "semantic": round(semantic_component, 3),
                "graph": round(graph_component, 3),
                "boosts": round(metadata_boost, 3),
                "lexical": round(lexical_component, 3),
                "recency": round(recency_component, 3),
                "version": round(version_component, 3),
            }

        ranked = sorted(scores.items(), key=lambda item: item[1], reverse=True)
        top_ranked = ranked[:15]

        reranker = self._load_reranker()
        if reranker is not None and top_ranked:
            pairs = []
            doc_ids = []
            for doc_id, _ in top_ranked:
                doc_ids.append(doc_id)
                snippet = self.documents[doc_id].get("preview", "")
                pairs.append((query_text, snippet))
            rerank_scores = reranker.predict(pairs)
            rerank_max = float(np.max(rerank_scores)) if len(rerank_scores) else 1.0
            rerank_min = float(np.min(rerank_scores)) if len(rerank_scores) else 0.0
            rerank_span = max(rerank_max - rerank_min, 1e-6)
            for idx, doc_id in enumerate(doc_ids):
                normalized = (float(rerank_scores[idx]) - rerank_min) / rerank_span
                rerank_boost = normalized * 0.1
                scores[doc_id] += rerank_boost
                debug_scores[doc_id]["rerank"] = round(rerank_boost, 3)
            ranked = sorted(scores.items(), key=lambda item: item[1], reverse=True)

        results = []
        for doc_id, score in ranked:
            if score <= 0.10:
                continue
            doc = self.documents[doc_id]
            results.append(
                {
                    "filename": doc["filename"],
                    "path": doc["path"],
                    "score": round(float(score), 3),
                    "breakdown": debug_scores[doc_id],
                    "snippet": doc["preview"] + "...",
                    "mod_time": doc["mod_time"],
                }
            )
            if len(results) >= 10:
                break

        return results

    def get_graph_html(self, query=None):
        from pyvis.network import Network

        net = Network(height="600px", width="100%", bgcolor="#222222", font_color="white")
        net.force_atlas_2based()

        for node in self.graph.nodes(data=True):
            net.add_node(node[0], label=node[1].get("label", "File"), title=node[1].get("label"), color="#ffc107")

        for edge in self.graph.edges(data=True):
            color = "gray"
            width = 1
            relation = edge[2].get("relation")
            if relation == "VERSION_OF":
                color = "#28a745"
                width = 3
            elif relation == "RELATED_TO":
                color = "#17a2b8"
                width = 2

            net.add_edge(edge[0], edge[1], title=relation, color=color, width=width)

        return net.generate_html("graph.html")