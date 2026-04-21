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
        self._folder_profiles: dict = {}
        self._topic_clusters:  dict = {}

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

        # ── Semantic enrichment (runs after all vectors are ready) ──────────
        # 1. Extract entities from each document's text and store on the doc
        print(">>> Extracting entities from documents...")
        for filepath, text in zip(files, texts):
            file_id = FileProcessor.get_file_hash(filepath)
            if file_id in self.documents:
                entities = self._extract_entities(text, os.path.basename(filepath))
                self.documents[file_id]["entities"] = entities

        # 2. Build folder semantic profiles from raw doc vectors
        print(">>> Building folder semantic profiles...")
        folder_profiles = self._build_folder_profiles()
        self._folder_profiles = folder_profiles  # cache on self for build_graph

        # 3. Context-enrich doc vectors with folder profiles
        print(">>> Context-enriching document vectors...")
        self._context_enrich_vectors(folder_profiles)

        # 4. Topic clustering on enriched vectors
        print(">>> Running topic cluster detection...")
        self._topic_clusters = self._build_topic_clusters()

        self.build_graph()
        self._save_cached_artifacts(signature)

    # ── Semantic understanding helpers ────────────────────────────────────

    @staticmethod
    def _extract_entities(text: str, filename: str) -> dict[str, list[str]]:
        """
        Extract named entities from text using regex patterns.
        Returns a dict of entity_type → [entity_string, ...].
        No NLP library required — pure regex on common patterns.
        """
        entities: dict[str, list[str]] = {
            "emails":     [],
            "dates":      [],
            "amounts":    [],
            "project_codes": [],
            "names":      [],
            "orgs":       [],
            "keywords":   [],
        }

        # Emails
        entities["emails"] = list(set(re.findall(
            r"[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}", text
        )))

        # Dates (various formats)
        entities["dates"] = list(set(re.findall(
            r"\b(?:\d{4}-\d{2}-\d{2}|\d{2}/\d{2}/\d{4}|"
            r"(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{1,2},?\s+\d{4})\b",
            text
        )))[:10]

        # Monetary amounts
        entities["amounts"] = list(set(re.findall(
            r"(?:USD|EUR|GBP|INR|₹|\$|€|£)\s*[\d,]+(?:\.\d{2})?|"
            r"[\d,]+(?:\.\d{2})?\s*(?:USD|EUR|GBP|INR)",
            text
        )))[:10]

        # Project / ticket codes  (e.g. PROJ-123, TKT_456, v2.1.3)
        entities["project_codes"] = list(set(re.findall(
            r"\b[A-Z]{2,8}[-_]\d+\b|v\d+\.\d+(?:\.\d+)?",
            text
        )))[:10]

        # Capitalised multi-word phrases (likely proper nouns / org names)
        # E.g. "TechCorp", "Project Alpha", "Semantic OS"
        cap_phrases = re.findall(r"\b(?:[A-Z][a-zA-Z0-9]+(?:\s+[A-Z][a-zA-Z0-9]+){0,3})\b", text)
        # Filter out common English title-case words
        stop_caps = {"The","A","An","In","On","At","To","For","Of","And","Or","But","Is","Are","Was"}
        cap_phrases = [p for p in cap_phrases if p not in stop_caps and len(p) > 3]
        # Take the most frequent ones
        from collections import Counter
        top = [w for w, _ in Counter(cap_phrases).most_common(15)]
        entities["names"] = top

        # High-frequency non-stopword content words (TF proxy for topic keywords)
        stop = {
            "the","a","an","in","on","at","to","for","of","and","or","but","is","are",
            "was","were","be","been","being","have","has","had","do","does","did","will",
            "would","could","should","may","might","shall","with","from","by","as","it",
            "its","this","that","these","those","we","our","i","my","you","your","they",
            "their","he","she","his","her","not","all","more","can","also","if","then",
            "so","up","out","no","other","new","just","into","about","than","over",
        }
        words = re.findall(r"\b[a-z]{4,}\b", text.lower())
        word_freq = Counter(words)
        entities["keywords"] = [w for w, c in word_freq.most_common(20) if w not in stop]

        return entities

    def _build_folder_profiles(self) -> dict[str, np.ndarray]:
        """
        Compute a mean embedding vector for each folder by averaging the
        document vectors of all files it directly contains.
        Returns folder_canon_path → mean_vector.
        """
        from collections import defaultdict
        folder_vecs: dict[str, list[np.ndarray]] = defaultdict(list)
        root_canon = self._canon(self.root_directory)

        for fid, doc in self.documents.items():
            vec = self.vectors.get(fid)
            if vec is None:
                continue
            cf = self._canon(doc["folder"])
            folder_vecs[cf].append(vec)

            # Also contribute to all ancestor folders up to root
            cur = cf
            while cur != root_canon:
                parent = self._canon(os.path.dirname(cur))
                if parent == cur or not parent.startswith(root_canon):
                    break
                folder_vecs[parent].append(vec)
                cur = parent

        profiles: dict[str, np.ndarray] = {}
        for cf, vecs in folder_vecs.items():
            mat = np.array(vecs, dtype=np.float32)
            mean = mat.mean(axis=0)
            norm = np.linalg.norm(mean)
            profiles[cf] = mean / norm if norm > 0 else mean

        return profiles

    def _build_topic_clusters(self, n_clusters: int | None = None) -> dict[str, int]:
        """
        Assign each document to a topic cluster using simple k-means on
        doc vectors.  Returns doc_id → cluster_id mapping.
        Automatically picks k = max(2, sqrt(n_docs / 2)).
        """
        doc_ids = [d for d in self.doc_ids_in_order if d in self.vectors]
        n = len(doc_ids)
        if n < 3:
            return {d: 0 for d in doc_ids}

        if n_clusters is None:
            import math
            n_clusters = max(2, min(int(math.sqrt(n / 2)), n // 2, 12))

        matrix = np.array([self.vectors[d] for d in doc_ids], dtype=np.float32)

        # K-means with random restarts (no sklearn needed)
        rng = np.random.default_rng(42)
        best_labels: np.ndarray | None = None
        best_inertia = float("inf")

        for _ in range(5):  # 5 restarts
            # Initialise centroids with k-means++ style spread
            centroids = [matrix[rng.integers(n)]]
            for _ in range(n_clusters - 1):
                dists = np.array([
                    min(np.dot(v, c) for c in centroids)
                    for v in matrix
                ])
                # Lower similarity = further away = better candidate centroid
                probs = 1 - np.clip(dists, 0, 1)
                probs /= probs.sum()
                centroids.append(matrix[rng.choice(n, p=probs)])

            centroids_arr = np.array(centroids, dtype=np.float32)

            for iteration in range(50):
                # Assign — cosine similarity (vectors already normalised)
                sims = matrix @ centroids_arr.T  # (n, k)
                labels = sims.argmax(axis=1)

                # Update centroids
                new_centroids = np.zeros_like(centroids_arr)
                for k in range(n_clusters):
                    mask = labels == k
                    if mask.sum() > 0:
                        mean = matrix[mask].mean(axis=0)
                        norm = np.linalg.norm(mean)
                        new_centroids[k] = mean / norm if norm > 0 else mean
                    else:
                        new_centroids[k] = centroids_arr[k]

                if np.allclose(centroids_arr, new_centroids, atol=1e-4):
                    break
                centroids_arr = new_centroids

            # Inertia = sum of (1 - max_similarity) for each point
            max_sims = (matrix @ centroids_arr.T).max(axis=1)
            inertia = float((1 - max_sims).sum())

            if inertia < best_inertia:
                best_inertia = inertia
                best_labels = labels.copy()

        cluster_map = {doc_ids[i]: int(best_labels[i]) for i in range(n)}
        n_actual = len(set(cluster_map.values()))
        print(f">>> Topic clustering: {n} docs → {n_actual} clusters (k={n_clusters})")
        return cluster_map

    def _context_enrich_vectors(self, folder_profiles: dict[str, np.ndarray]) -> None:
        """
        Replace each doc vector with a weighted blend of its own vector and
        its folder's semantic profile.  This makes cross-folder similarity
        more meaningful — a finance doc in /work/invoices will be pulled
        slightly toward other finance docs even if their raw similarity is below
        the threshold.

        final_vec = 0.85 * doc_vec + 0.15 * folder_profile_vec
        """
        alpha = 0.15
        root_canon = self._canon(self.root_directory)

        for fid, doc in self.documents.items():
            vec = self.vectors.get(fid)
            if vec is None:
                continue
            cf = self._canon(doc["folder"])
            fp = folder_profiles.get(cf)
            if fp is None:
                continue
            blended = (1 - alpha) * vec + alpha * fp
            norm = np.linalg.norm(blended)
            self.vectors[fid] = blended / norm if norm > 0 else blended

    @staticmethod
    def _norm_stem(filename: str) -> str:
        """
        Strip extension and version/draft/final suffixes, return lowercase.
        Used for VERSION_OF matching — must be an exact stem match, not a
        substring match, to avoid false positives.
        e.g.  "Report_v2_FINAL.pdf"  →  "report"
              "report_draft.docx"    →  "report"
              "annual_report.md"     →  "annual_report"   (no suffix stripped)
        """
        stem = os.path.splitext(filename)[0].lower()
        # Strip common version/status suffixes iteratively until stable
        pattern = re.compile(
            r"[_\-]?(v\d+(\.\d+)*|draft|final|copy|revised|review|old|new|latest|backup)$",
            re.IGNORECASE,
        )
        prev = None
        while prev != stem:
            prev = stem
            stem = pattern.sub("", stem).strip("_- ")
        return stem

    @staticmethod
    def _folder_depth(folder: str, root: str) -> int:
        """Number of path components between root and folder (0 = root itself)."""
        rel = os.path.relpath(folder, root)
        if rel == ".":
            return 0
        return len(rel.replace("\\", "/").split("/"))

    @staticmethod
    def _common_ancestor(folder_a: str, folder_b: str) -> str:
        """Return the deepest common directory of two absolute folder paths."""
        parts_a = os.path.normpath(folder_a).split(os.sep)
        parts_b = os.path.normpath(folder_b).split(os.sep)
        common = []
        for pa, pb in zip(parts_a, parts_b):
            if pa == pb:
                common.append(pa)
            else:
                break
        return os.sep.join(common) if common else os.sep

    def _adaptive_similarity_threshold(self) -> float:
        """
        Compute a per-corpus similarity threshold for RELATED_TO edges.

        Strategy: take the 85th-percentile pairwise similarity across a
        random sample of document pairs.  This ensures the threshold scales
        with the actual embedding distribution of *this* corpus rather than
        using a hardcoded value that fires on everything for bge-small-en.

        Falls back to 0.92 when there are fewer than 4 documents.
        """
        doc_ids = [d for d in self.doc_ids_in_order if d in self.vectors]
        n = len(doc_ids)
        if n < 4:
            return 0.92

        import random
        rng = random.Random(42)
        # Sample at most 300 pairs to keep startup fast
        max_pairs = 300
        pairs_needed = min(max_pairs, n * (n - 1) // 2)
        all_pairs = [(i, j) for i in range(n) for j in range(i + 1, n)]
        sampled = rng.sample(all_pairs, pairs_needed)

        sims = []
        for i, j in sampled:
            va = self.vectors[doc_ids[i]]
            vb = self.vectors[doc_ids[j]]
            sims.append(float(np.dot(va, vb)))

        sims.sort()
        # 85th percentile — only the top 15% of pairs get a RELATED_TO edge
        idx = int(len(sims) * 0.85)
        threshold = sims[min(idx, len(sims) - 1)]
        # Hard floor and ceiling to stay sane
        threshold = max(0.88, min(threshold, 0.97))
        print(f">>> RELATED_TO threshold: {threshold:.4f}  (85th-pct of {len(sims)} sampled pairs)")
        return threshold

    # ── Main graph builder ─────────────────────────────────────────────────

    @staticmethod
    def _canon(path: str) -> str:
        """
        Canonical path with forward slashes — normalised but NOT made absolute
        via abspath, because abspath resolves relative to the process cwd which
        may differ from the project root.  All paths coming from os.walk /
        os.path.dirname are already absolute, so normpath alone is sufficient.
        """
        return os.path.normpath(path).replace("\\", "/")

    @staticmethod
    def _folder_node_id(canon_folder: str) -> str:
        return f"folder:{canon_folder}"

    def build_graph(self):
        """
        Build the knowledge graph with four relationship types:

        VERSION_OF      — same document stem at different revision stages.
        CO_LOCATED      — files sharing the exact same folder.
        PARENT_FOLDER   — folder → file containment edge.
        CONTAINS_FOLDER — folder → subfolder containment edge.
        RELATED_TO      — semantic similarity above an adaptive threshold.
        """
        print(">>> Building Relationship Graph...")
        self.graph = nx.DiGraph()

        root_canon = self._canon(self.root_directory)

        # ── Helper: normalise every stored folder path ──────────────────────
        # doc["folder"] comes from os.path.dirname which may use backslashes.
        # Canonicalise once and use throughout so all node IDs match.
        canon_folder: dict[str, str] = {
            fid: self._canon(doc["folder"])
            for fid, doc in self.documents.items()
        }

        # ── 1. Collect every folder that exists between root and any file ───
        all_canon_folders: set[str] = set()

        # Always include root itself
        all_canon_folders.add(root_canon)

        for cf in canon_folder.values():
            # Only track folders that are at or below root
            if not cf.startswith(root_canon):
                continue
            cur = cf
            while True:
                all_canon_folders.add(cur)
                if cur == root_canon:
                    break
                parent = self._canon(os.path.dirname(cur))
                if parent == cur:
                    # Reached the filesystem root without hitting root_canon — stop
                    break
                cur = parent

        # ── 2. Add folder nodes ─────────────────────────────────────────────
        # Debug: print discovered folders so misconfigured roots are obvious
        rel_folders = []
        for cf in sorted(all_canon_folders):
            try:
                rel = os.path.relpath(cf, root_canon).replace("\\", "/")
            except ValueError:
                continue
            rel_folders.append(rel)
        print(f">>> Discovered {len(all_canon_folders)} folder(s): {rel_folders}")

        for cf in all_canon_folders:
            try:
                rel = os.path.relpath(cf, root_canon).replace("\\", "/")
            except ValueError:
                # On Windows, relpath fails across drives — skip
                continue
            label = os.path.basename(cf) if cf != root_canon else os.path.basename(root_canon)
            self.graph.add_node(
                self._folder_node_id(cf),
                label=label or rel,
                type="folder",
                rel_path=rel,
                abs_path=cf,
            )

        # ── 3. Add file nodes ───────────────────────────────────────────────
        for file_id, doc in self.documents.items():
            cf  = canon_folder[file_id]
            try:
                rel = os.path.relpath(doc["path"], root_canon).replace("\\", "/")
            except ValueError:
                rel = doc["filename"]
            self.graph.add_node(
                file_id,
                label=doc["filename"],
                type="file",
                folder=cf,
                rel_path=rel,
                doc_type=doc["metadata"].get("type", "general"),
                extension=doc["metadata"].get("extension", ""),
            )

        # ── 4. File → parent-folder edges (PARENT_FOLDER) ──────────────────
        for file_id in self.documents:
            cf          = canon_folder[file_id]
            folder_node = self._folder_node_id(cf)
            if self.graph.has_node(folder_node):
                self.graph.add_edge(folder_node, file_id, relation="PARENT_FOLDER")
            else:
                print(f"    [WARN] no folder node for {cf!r} (file {self.documents[file_id]['filename']!r})")

        # ── 5. Folder → subfolder edges (CONTAINS_FOLDER) ──────────────────
        for cf in all_canon_folders:
            if cf == root_canon:
                continue  # root has no parent inside our watch tree
            parent_canon = self._canon(os.path.dirname(cf))
            # Only link if the parent is also within our tracked set
            if parent_canon not in all_canon_folders:
                continue
            parent_node = self._folder_node_id(parent_canon)
            child_node  = self._folder_node_id(cf)
            if (
                self.graph.has_node(parent_node)
                and self.graph.has_node(child_node)
                and parent_node != child_node
            ):
                self.graph.add_edge(parent_node, child_node, relation="CONTAINS_FOLDER")

        # ── 6. Pairwise file relationships ─────────────────────────────────
        # Pre-compute normalised stems for VERSION_OF detection
        stems: dict[str, str] = {
            fid: self._norm_stem(doc["filename"])
            for fid, doc in self.documents.items()
        }

        # Adaptive threshold so RELATED_TO doesn't fire on everything
        sim_threshold = self._adaptive_similarity_threshold()

        # Topic clusters (may be empty if not yet computed on this run)
        topic_clusters: dict[str, int] = getattr(self, "_topic_clusters", {})

        doc_ids = list(self.documents.keys())

        for i, fid_a in enumerate(doc_ids):
            stem_a   = stems[fid_a]
            vec_a    = self.vectors.get(fid_a)
            folder_a = canon_folder[fid_a]
            doc_a    = self.documents[fid_a]
            ents_a   = doc_a.get("entities", {})

            for j in range(i + 1, len(doc_ids)):
                fid_b    = doc_ids[j]
                stem_b   = stems[fid_b]
                vec_b    = self.vectors.get(fid_b)
                folder_b = canon_folder[fid_b]
                doc_b    = self.documents[fid_b]
                ents_b   = doc_b.get("entities", {})

                # ── VERSION_OF: exact stem match only ──────────────────────
                is_version = stem_a and stem_b and stem_a == stem_b and len(stem_a) >= 4
                if is_version:
                    if doc_a["mod_time"] <= doc_b["mod_time"]:
                        self.graph.add_edge(fid_a, fid_b, relation="VERSION_OF")
                    else:
                        self.graph.add_edge(fid_b, fid_a, relation="VERSION_OF")

                # ── CO_LOCATED: same canonical folder, not a version pair ──
                elif folder_a == folder_b:
                    self.graph.add_edge(fid_a, fid_b, relation="CO_LOCATED")
                    self.graph.add_edge(fid_b, fid_a, relation="CO_LOCATED")

                # ── SHARES_ENTITY: meaningful shared named entities ─────────
                # Check across high-signal entity types only (not keywords,
                # which are too common and would recreate the "everything
                # is related" problem)
                shared_entities: list[str] = []
                for etype in ("emails", "project_codes", "amounts", "names"):
                    a_set = set(ents_a.get(etype, []))
                    b_set = set(ents_b.get(etype, []))
                    shared = a_set & b_set
                    if shared:
                        shared_entities.extend(list(shared)[:3])

                if shared_entities and not is_version:
                    # Weight = proportion of entities shared vs total unique
                    total_unique = len(
                        set(ents_a.get("names", []) + ents_b.get("names", []))
                        | set(ents_a.get("project_codes", []) + ents_b.get("project_codes", []))
                    ) or 1
                    weight = round(min(len(shared_entities) / total_unique, 1.0), 3)
                    payload = dict(
                        relation="SHARES_ENTITY",
                        weight=weight,
                        shared=shared_entities[:5],
                    )
                    self.graph.add_edge(fid_a, fid_b, **payload)
                    self.graph.add_edge(fid_b, fid_a, **payload)

                # ── SAME_TOPIC: same topic cluster, cross-folder ────────────
                # Only add when files are in different folders — same-folder
                # files are already linked by CO_LOCATED.
                cluster_a = topic_clusters.get(fid_a)
                cluster_b = topic_clusters.get(fid_b)
                if (
                    cluster_a is not None
                    and cluster_b is not None
                    and cluster_a == cluster_b
                    and folder_a != folder_b
                    and not is_version
                    and not self.graph.has_edge(fid_a, fid_b)
                ):
                    self.graph.add_edge(fid_a, fid_b, relation="SAME_TOPIC",
                                        cluster=cluster_a, weight=0.5)
                    self.graph.add_edge(fid_b, fid_a, relation="SAME_TOPIC",
                                        cluster=cluster_a, weight=0.5)

                # ── RELATED_TO: semantic similarity above adaptive threshold ─
                if vec_a is not None and vec_b is not None:
                    similarity = float(np.dot(vec_a, vec_b))
                    if similarity >= sim_threshold and not is_version:
                        self.graph.add_edge(
                            fid_a, fid_b,
                            relation="RELATED_TO",
                            weight=round(similarity, 4),
                        )
                        self.graph.add_edge(
                            fid_b, fid_a,
                            relation="RELATED_TO",
                            weight=round(similarity, 4),
                        )

        # ── 7. Folder-level semantic similarity (FOLDER_SIMILAR) ───────────
        folder_profiles: dict[str, np.ndarray] = getattr(self, "_folder_profiles", {})
        folder_ids = [
            self._folder_node_id(cf)
            for cf in all_canon_folders
            if self.graph.has_node(self._folder_node_id(cf))
        ]
        cf_list = [
            cf for cf in all_canon_folders
            if cf in folder_profiles and self.graph.has_node(self._folder_node_id(cf))
        ]

        FOLDER_SIM_THRESHOLD = 0.80
        for i, cf_a in enumerate(cf_list):
            for j in range(i + 1, len(cf_list)):
                cf_b = cf_list[j]
                # Don't link parent-child folders (already structurally linked)
                if cf_a.startswith(cf_b + "/") or cf_b.startswith(cf_a + "/"):
                    continue
                sim = float(np.dot(folder_profiles[cf_a], folder_profiles[cf_b]))
                if sim >= FOLDER_SIM_THRESHOLD:
                    fn_a = self._folder_node_id(cf_a)
                    fn_b = self._folder_node_id(cf_b)
                    self.graph.add_edge(fn_a, fn_b, relation="FOLDER_SIMILAR",
                                        weight=round(sim, 4))
                    self.graph.add_edge(fn_b, fn_a, relation="FOLDER_SIMILAR",
                                        weight=round(sim, 4))

        # ── 7. PageRank (file nodes only) ──────────────────────────────────
        file_subgraph = self.graph.subgraph(
            [n for n, d in self.graph.nodes(data=True) if d.get("type") == "file"]
        )
        self.pagerank_scores = (
            nx.pagerank(file_subgraph) if file_subgraph.number_of_nodes() else {}
        )

        n_files   = sum(1 for _, d in self.graph.nodes(data=True) if d.get("type") == "file")
        n_folders = sum(1 for _, d in self.graph.nodes(data=True) if d.get("type") == "folder")
        print(
            f">>> Graph built: {n_files} file nodes, {n_folders} folder nodes, "
            f"{self.graph.number_of_edges()} edges."
        )

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

    def compare_documents(self, doc_ids: list[str]) -> dict:
        """
        Compute pairwise semantic similarity across two or more documents.

        The score is context-aware and combines:
          - global document embedding similarity
          - chunk-to-chunk contextual alignment
          - entity overlap

        To avoid inflated scores from one or two shared keywords, a penalty is
        applied when lexical overlap is very low and semantic alignment is weak.
        """
        unique_doc_ids = [doc_id for doc_id in dict.fromkeys(doc_ids) if doc_id in self.documents and doc_id in self.vectors]
        if len(unique_doc_ids) < 2:
            return {"files": [], "pairs": [], "matrix": []}

        chunk_indices_by_doc: dict[str, list[int]] = {}
        for index, parent_id in enumerate(self.chunk_parent_ids):
            if parent_id in unique_doc_ids:
                chunk_indices_by_doc.setdefault(parent_id, []).append(index)

        stop_words = {
            "the", "and", "for", "with", "from", "that", "this", "your", "you", "are",
            "have", "has", "had", "was", "were", "will", "would", "should", "could", "into",
            "about", "just", "only", "also", "than", "then", "they", "them", "their", "our",
            "not", "but", "can", "all", "any", "one", "two", "three", "file", "files", "document",
        }

        def _token_profile(doc_id: str, top_k: int = 40) -> dict[str, int]:
            counter: dict[str, int] = {}
            for idx in chunk_indices_by_doc.get(doc_id, []):
                text = self.chunk_texts[idx]
                tokens = re.findall(r"[a-zA-Z][a-zA-Z0-9_]{2,}", text.lower())
                for token in tokens:
                    if token in stop_words:
                        continue
                    counter[token] = counter.get(token, 0) + 1
            ranked = sorted(counter.items(), key=lambda item: item[1], reverse=True)[:top_k]
            return {token: freq for token, freq in ranked}

        def _entity_profile(doc_id: str) -> set[str]:
            payload = self.documents.get(doc_id, {}).get("entities") or {}
            values: set[str] = set()
            for _, raw_list in payload.items():
                if not isinstance(raw_list, list):
                    continue
                for item in raw_list:
                    token = str(item).strip().lower()
                    if token:
                        values.add(token)
            return values

        token_profiles = {doc_id: _token_profile(doc_id) for doc_id in unique_doc_ids}
        entity_profiles = {doc_id: _entity_profile(doc_id) for doc_id in unique_doc_ids}

        pair_results = []
        matrix_values: dict[str, dict[str, float]] = {
            doc_id: {inner: (1.0 if inner == doc_id else 0.0) for inner in unique_doc_ids}
            for doc_id in unique_doc_ids
        }

        for i, doc_a in enumerate(unique_doc_ids):
            for j in range(i + 1, len(unique_doc_ids)):
                doc_b = unique_doc_ids[j]
                vec_a = self.vectors.get(doc_a)
                vec_b = self.vectors.get(doc_b)
                if vec_a is None or vec_b is None:
                    continue

                embedding_similarity = float(max(0.0, np.dot(vec_a, vec_b)))

                chunk_alignment = 0.0
                pair_matrix = None
                indices_a = chunk_indices_by_doc.get(doc_a, [])
                indices_b = chunk_indices_by_doc.get(doc_b, [])
                if indices_a and indices_b and self.chunk_embeddings is not None and len(self.chunk_embeddings) > 0:
                    matrix_a = self.chunk_embeddings[indices_a]
                    matrix_b = self.chunk_embeddings[indices_b]
                    pair_matrix = np.dot(matrix_a, matrix_b.T)
                    forward = float(np.mean(np.max(pair_matrix, axis=1))) if pair_matrix.size else 0.0
                    backward = float(np.mean(np.max(pair_matrix, axis=0))) if pair_matrix.size else 0.0
                    chunk_alignment = max(0.0, (forward + backward) / 2.0)

                tokens_a = token_profiles.get(doc_a, {})
                tokens_b = token_profiles.get(doc_b, {})
                set_tokens_a = set(tokens_a.keys())
                set_tokens_b = set(tokens_b.keys())
                union_tokens = set_tokens_a | set_tokens_b
                shared_tokens = set_tokens_a & set_tokens_b
                keyword_overlap = (len(shared_tokens) / len(union_tokens)) if union_tokens else 0.0

                shared_word_details = sorted(
                    [
                        {
                            "word": token,
                            "count_a": tokens_a.get(token, 0),
                            "count_b": tokens_b.get(token, 0),
                            "support": min(tokens_a.get(token, 0), tokens_b.get(token, 0)),
                        }
                        for token in shared_tokens
                    ],
                    key=lambda item: (-item["support"], -(item["count_a"] + item["count_b"]), item["word"]),
                )

                entities_a = entity_profiles.get(doc_a, set())
                entities_b = entity_profiles.get(doc_b, set())
                shared_entities = entities_a & entities_b
                entity_base = min(len(entities_a), len(entities_b))
                entity_overlap = (len(shared_entities) / entity_base) if entity_base > 0 else 0.0

                # Calibrate to normalize naturally-high cosine baselines while allowing
                # identical files to score perfectly. Lower floors than before.
                embedding_calibrated = max(0.0, min(1.0, (embedding_similarity - 0.48) / 0.40))
                chunk_calibrated = max(0.0, min(1.0, (chunk_alignment - 0.46) / 0.42))

                # Divergence penalty: punish disagreement between dimensions.
                # If one is high and one is low, that's suspicious (noise).
                divergence = abs(embedding_calibrated - chunk_calibrated)
                divergence_penalty = 1.0 - (0.25 * divergence)

                # Blend: still require alignment, but use weighted average + divergence gate.
                # Geometric mean was too strict for near-identical files.
                blend_score = (0.55 * embedding_calibrated) + (0.45 * chunk_calibrated)
                # Reduce entity contribution to prevent single-entity false positives
                score = (0.92 * blend_score * divergence_penalty) + (0.03 * entity_overlap)

                # ─ HYBRID GATE 1: Require minimum semantic alignment ─
                # Even with shared entities/keywords, at least one semantic dimension must be strong
                max_semantic = max(embedding_calibrated, chunk_calibrated)
                min_semantic = min(embedding_calibrated, chunk_calibrated)
                if max_semantic < 0.55:
                    # Very weak semantics across the board — suppress even if entities match
                    score = min(score, 0.35)
                elif max_semantic < 0.62 and min_semantic < 0.45:
                    # One dimension is weak, the other just okay — be cautious
                    score *= 0.75

                # ─ HYBRID GATE 2: Entity-only false positive prevention ─
                # High entity overlap alone should not drive similarity without semantic backing
                if entity_overlap > 0.4 and max_semantic < 0.60:
                    # Many shared entities but weak semantics = likely noise
                    score = min(score, 0.42)
                    if max_semantic < 0.50:
                        score = min(score, 0.30)

                # ─ HYBRID GATE 3: Keyword/lexical gates with stricter thresholds ─
                # Apply even with some overlap — penalize lack of lexical evidence
                if keyword_overlap < 0.08:
                    score *= 0.90
                if keyword_overlap < 0.04 and entity_overlap < 0.2:
                    score = min(score, 0.40)

                # Strong divergence gate: dimensions must not disagree too much.
                # This is the main anti-false-positive mechanism.
                if divergence > 0.55:
                    score = min(score, 0.45)
                if divergence > 0.70:
                    score = min(score, 0.30)

                score = float(min(1.0, max(0.0, score)))

                # Balanced label thresholds.
                if score >= 0.72:
                    label = "strong contextual match"
                elif score >= 0.52:
                    label = "moderate contextual match"
                elif score >= 0.35:
                    label = "weak thematic overlap"
                else:
                    label = "low semantic similarity"

                explanation_parts = [
                    f"{self.documents[doc_a]['filename']} and {self.documents[doc_b]['filename']} show {label}."
                ]
                if embedding_calibrated >= 0.70 and chunk_calibrated >= 0.70 and divergence <= 0.25:
                    explanation_parts.append("Strong alignment across embedding, chunk context, and entities indicates genuine similarity.")
                elif embedding_calibrated >= 0.62 and chunk_calibrated >= 0.62 and divergence <= 0.35:
                    explanation_parts.append("Both semantic dimensions (embedding & context) agree strongly.")
                elif keyword_overlap > 0.14:
                    explanation_parts.append("Shared terminology is notable, but semantic alignment is modest.")
                else:
                    explanation_parts.append("Limited contextual overlap detected; score is conservative.")

                if divergence > 0.55:
                    explanation_parts.append(f"⚠ Dimension mismatch: embedding {embedding_calibrated:.2f} vs context {chunk_calibrated:.2f} reduce confidence.")

                if shared_entities:
                    entity_preview = sorted(shared_entities)[:3]
                    explanation_parts.append(f"Common entities: {', '.join(entity_preview)}.")

                if shared_tokens:
                    explanation_parts.append(
                        f"Common words: {len(shared_tokens)} shared out of {len(union_tokens)} unique candidate words."
                    )

                top_keywords = [item["word"] for item in shared_word_details[:10]]

                contextual_matches = []
                if pair_matrix is not None and pair_matrix.size:
                    # Keep top aligned chunk pairs to show concrete contextual meaning.
                    candidate_pairs = []
                    for row_idx in range(pair_matrix.shape[0]):
                        col_idx = int(np.argmax(pair_matrix[row_idx]))
                        candidate_pairs.append((float(pair_matrix[row_idx, col_idx]), row_idx, col_idx))
                    candidate_pairs.sort(key=lambda item: item[0], reverse=True)

                    used_cols = set()
                    for sim_value, row_idx, col_idx in candidate_pairs:
                        if col_idx in used_cols:
                            continue
                        used_cols.add(col_idx)
                        a_chunk = self.chunk_texts[indices_a[row_idx]].strip().replace("\n", " ")
                        b_chunk = self.chunk_texts[indices_b[col_idx]].strip().replace("\n", " ")
                        if not a_chunk or not b_chunk:
                            continue
                        contextual_matches.append(
                            {
                                "similarity": round(max(0.0, sim_value), 4),
                                "snippet_a": a_chunk[:180],
                                "snippet_b": b_chunk[:180],
                            }
                        )
                        if len(contextual_matches) >= 3:
                            break

                if chunk_calibrated >= 0.72 and embedding_calibrated >= 0.68:
                    context_label = "strong contextual alignment"
                    interpretation = "Both files discuss highly similar ideas and phrasing across multiple passages."
                elif chunk_calibrated >= 0.56 and embedding_calibrated >= 0.52:
                    context_label = "moderate contextual alignment"
                    interpretation = "The files share meaningful topics, but emphasis differs in some sections."
                elif chunk_calibrated >= 0.42 or embedding_calibrated >= 0.42:
                    context_label = "partial contextual overlap"
                    interpretation = "Some related concepts appear, but the broader context is mixed."
                else:
                    context_label = "low contextual alignment"
                    interpretation = "The files may share a few terms, but their main context differs."

                shared_themes = [item["word"] for item in shared_word_details[:6]]

                pair_payload = {
                    "doc_a": doc_a,
                    "doc_b": doc_b,
                    "score": round(score, 4),
                    "label": label,
                    "metrics": {
                        "embedding_similarity": round(float(embedding_similarity), 4),
                        "chunk_alignment": round(float(chunk_alignment), 4),
                        "embedding_calibrated": round(float(embedding_calibrated), 4),
                        "chunk_calibrated": round(float(chunk_calibrated), 4),
                        "blend_score": round(float(blend_score), 4),
                        "dimension_divergence": round(float(divergence), 4),
                        "keyword_overlap": round(float(keyword_overlap), 4),
                        "entity_overlap": round(float(entity_overlap), 4),
                    },
                    "shared_keywords": top_keywords,
                    "word_overlap": {
                        "shared_count": len(shared_tokens),
                        "union_count": len(union_tokens),
                        "ratio": round(float(keyword_overlap), 4),
                        "top_shared_words": top_keywords,
                        "top_shared_word_details": [
                            {
                                "word": item["word"],
                                "count_a": item["count_a"],
                                "count_b": item["count_b"],
                            }
                            for item in shared_word_details[:10]
                        ],
                    },
                    "contextual_meaning": {
                        "label": context_label,
                        "interpretation": interpretation,
                        "shared_themes": shared_themes,
                        "matched_passages": contextual_matches,
                    },
                    "shared_entities": sorted(shared_entities)[:6],
                    "explanation": " ".join(explanation_parts),
                }
                pair_results.append(pair_payload)
                matrix_values[doc_a][doc_b] = score
                matrix_values[doc_b][doc_a] = score

        pair_results.sort(key=lambda item: item["score"], reverse=True)

        matrix_rows = []
        for doc_id in unique_doc_ids:
            row = {
                "doc_id": doc_id,
                "values": [round(float(matrix_values[doc_id][other_id]), 4) for other_id in unique_doc_ids],
            }
            matrix_rows.append(row)

        files_payload = []
        for doc_id in unique_doc_ids:
            doc = self.documents[doc_id]
            files_payload.append(
                {
                    "doc_id": doc_id,
                    "filename": doc.get("filename", "unknown"),
                    "path": doc.get("path", ""),
                    "metadata": doc.get("metadata", {}),
                }
            )

        return {
            "files": files_payload,
            "pairs": pair_results,
            "matrix": matrix_rows,
        }

    def get_graph_html(self, query=None):
        from pyvis.network import Network

        net = Network(height="600px", width="100%", bgcolor="#0e1017", font_color="#f0f2f8")
        net.force_atlas_2based()

        NODE_COLORS = {
            "folder":       "#343a4a",   # dark grey — structural
            "file_default": "#4f80ff",   # blue
            "resume":       "#ff6b6b",   # coral
            "invoice":      "#ffb340",   # amber
            "meeting_notes":"#2ee8c8",   # teal
            "specification":"#b57bff",   # violet
            "general":      "#4f80ff",   # blue
        }
        EDGE_COLORS = {
            "VERSION_OF":     "#4f80ff",
            "CO_LOCATED":     "#2ee8c8",
            "RELATED_TO":     "#ffb340",
            "PARENT_FOLDER":  "#343a4a",
            "CONTAINS_FOLDER":"#343a4a",
        }

        for node_id, attrs in self.graph.nodes(data=True):
            node_type = attrs.get("type", "file")
            if node_type == "folder":
                net.add_node(
                    node_id,
                    label=attrs.get("label", "folder"),
                    title=f"📁 {attrs.get('rel_path', '')}",
                    color=NODE_COLORS["folder"],
                    shape="box",
                    size=18,
                    font={"size": 11, "color": "#9aa0b4"},
                )
            else:
                doc_type  = attrs.get("doc_type", "general")
                extension = attrs.get("extension", "")
                color     = NODE_COLORS.get(doc_type, NODE_COLORS["file_default"])
                net.add_node(
                    node_id,
                    label=attrs.get("label", "file"),
                    title=f"{attrs.get('label','')} [{extension}]",
                    color=color,
                    shape="dot",
                    size=14,
                )

        for src, tgt, attrs in self.graph.edges(data=True):
            relation = attrs.get("relation", "")
            color    = EDGE_COLORS.get(relation, "#5c6278")
            width    = 1
            dashes   = False
            if relation == "VERSION_OF":
                width = 3
            elif relation == "CO_LOCATED":
                width = 2
            elif relation == "RELATED_TO":
                width  = 2
                dashes = True
            elif relation in ("PARENT_FOLDER", "CONTAINS_FOLDER"):
                width = 1
                color = "#272b36"

            net.add_edge(src, tgt, title=relation, color=color, width=width, dashes=dashes)

        return net.generate_html("graph.html")