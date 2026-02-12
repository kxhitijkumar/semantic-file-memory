import os
import hashlib
import json
import re
from datetime import datetime

# NLP & ML
import ollama
import numpy as np
from sentence_transformers import SentenceTransformer
from rank_bm25 import BM25Okapi
from sklearn.metrics.pairwise import cosine_similarity
import networkx as nx

# File Handling
import PyPDF2
from docx import Document

class FileProcessor:
    """Handles text extraction from supported file types."""
    
    @staticmethod
    def get_file_hash(filepath):
        return hashlib.md5(filepath.encode()).hexdigest()

    @staticmethod
    def extract_text(filepath):
        ext = os.path.splitext(filepath)[1].lower()
        content = ""
        try:
            if ext in ['.txt', '.md', '.py', '.json']:
                with open(filepath, 'r', encoding='utf-8', errors='ignore') as f:
                    content = f.read()
            elif ext == '.pdf':
                with open(filepath, 'rb') as f:
                    reader = PyPDF2.PdfReader(f)
                    for page in reader.pages:
                        if page.extract_text():
                            content += page.extract_text() + "\n"
            elif ext == '.docx':
                doc = Document(filepath)
                content = "\n".join([p.text for p in doc.paragraphs])
        except Exception as e:
            print(f"Error reading {filepath}: {e}")
        return content

class SemanticMemory:
    """Core Engine: Indexing, Graph Construction, and Hybrid Search."""

    def __init__(self, root_directory):
        self.root_directory = root_directory
        print(">>> Loading AI Models...")
        # Using a slightly stronger model if available, else standard L6
        self.encoder = SentenceTransformer('all-MiniLM-L6-v2') 
        self.graph = nx.DiGraph()
        
        self.documents = {} 
        self.vectors = {} 
        self.bm25 = None
        self.bm25_corpus_ids = []
        
        self.index_files()
        self.build_graph()

    def index_files(self):
        print(">>> Scanning and Indexing files...")
        corpus_tokens = []
        
        for root, _, files in os.walk(self.root_directory):
            for file in files:
                if file.startswith('~$') or file.startswith('.'): continue
                
                filepath = os.path.join(root, file)
                file_id = FileProcessor.get_file_hash(filepath)
                text = FileProcessor.extract_text(filepath)
                
                # Check for empty text
                if not text.strip():
                    # Fallback to filename if file is empty/unreadable
                    text = file.replace("_", " ").replace(".", " ")

                stats = os.stat(filepath)
                mod_time = datetime.fromtimestamp(stats.st_mtime).isoformat()
                
                self.documents[file_id] = {
                    "id": file_id,
                    "path": filepath,
                    "filename": file,
                    "text": text, # Store full text for indexing
                    "preview": text[:500],
                    "mod_time": mod_time,
                    "folder": root
                }
                
                # Embeddings
                embedding = self.encoder.encode(text[:2000]) # Limit context window
                self.vectors[file_id] = embedding
                
                # BM25 Tokens
                tokens = text.lower().split()
                corpus_tokens.append(tokens)
                self.bm25_corpus_ids.append(file_id)
        
        if corpus_tokens:
            self.bm25 = BM25Okapi(corpus_tokens)
        print(f">>> Indexed {len(self.documents)} documents.")

    def build_graph(self):
        print(">>> Building Relationship Graph...")
        
        for file_id, doc in self.documents.items():
            self.graph.add_node(file_id, label=doc['filename'], type='file')
            
            for other_id, other_doc in self.documents.items():
                if file_id == other_id: continue
                
                # 1. CO_LOCATED & VERSION_OF
                if doc['folder'] == other_doc['folder']:
                    self.graph.add_edge(file_id, other_id, relation="CO_LOCATED")
                    
                    # Improved Version Detection
                    name_a = os.path.splitext(doc['filename'])[0].lower()
                    name_b = os.path.splitext(other_doc['filename'])[0].lower()
                    
                    # Clean names (remove v1, draft, final)
                    clean_a = re.sub(r'(_v\d+|_draft|_final)', '', name_a)
                    clean_b = re.sub(r'(_v\d+|_draft|_final)', '', name_b)

                    if clean_a == clean_b or name_a in name_b:
                        t_a = doc['mod_time']
                        t_b = other_doc['mod_time']
                        if t_a < t_b:
                            self.graph.add_edge(file_id, other_id, relation="VERSION_OF")

        # 2. RELATED_TO (Semantic)
        doc_ids = list(self.vectors.keys())
        if len(doc_ids) > 1:
            matrix = np.array([self.vectors[did] for did in doc_ids])
            sim_matrix = cosine_similarity(matrix)
            
            # Lowered threshold slightly for better connectivity
            threshold = 0.65 
            for i in range(len(doc_ids)):
                for j in range(i + 1, len(doc_ids)):
                    if sim_matrix[i][j] > threshold:
                        self.graph.add_edge(doc_ids[i], doc_ids[j], relation="RELATED_TO")

        print(f">>> Graph built: {self.graph.number_of_nodes()} nodes, {self.graph.number_of_edges()} edges.")

    def parse_intent(self, query):
        """Robust intent parsing."""
        prompt = f"""
        Analyze search query: "{query}"
        Return ONLY JSON.
        Keys: "keywords" (list), "file_type" (string or null), "sort_by" ("date" or "relevance").
        Example: {{"keywords": ["resume"], "file_type": "pdf", "sort_by": "date"}}
        """
        try:
            response = ollama.chat(model='phi3:mini', messages=[{'role': 'user', 'content': prompt}])
            content = response['message']['content']
            content = content.replace("```json", "").replace("```", "").strip()
            
            # JSON extraction hack
            start = content.find('{')
            end = content.rfind('}')
            if start != -1 and end != -1:
                return json.loads(content[start:end+1])
        except:
            pass
        
        return {"keywords": [query], "file_type": None, "sort_by": "relevance"}

    def hybrid_search(self, query_text):
        intent = self.parse_intent(query_text)
        print(f"Debug Intent: {intent}")
        
        # 1. Keywords setup
        raw_keywords = " ".join(intent.get('keywords', [query_text]))
        if not raw_keywords: raw_keywords = query_text
        
        scores = {doc_id: 0.0 for doc_id in self.documents}
        debug_scores = {doc_id: {} for doc_id in self.documents}

        # 2. Vector Search (The "Vibe" Check) - Weight 0.4
        query_vec = self.encoder.encode(raw_keywords)
        for doc_id, doc_vec in self.vectors.items():
            sim = np.dot(query_vec, doc_vec) / (np.linalg.norm(query_vec) * np.linalg.norm(doc_vec))
            weighted_score = sim * 0.4
            scores[doc_id] += weighted_score
            debug_scores[doc_id]['vector'] = round(weighted_score, 3)

        # 3. BM25 (The "Exact Match" Check) - Weight 0.4
        if self.bm25:
            tokenized_query = raw_keywords.lower().split()
            bm25_scores = self.bm25.get_scores(tokenized_query)
            max_bm25 = max(bm25_scores) if bm25_scores.any() else 1.0
            if max_bm25 == 0: max_bm25 = 1.0
            
            for idx, score in enumerate(bm25_scores):
                doc_id = self.bm25_corpus_ids[idx]
                norm_score = (score / max_bm25) * 0.4
                scores[doc_id] += norm_score
                debug_scores[doc_id]['bm25'] = round(norm_score, 3)

        # 4. Graph & Metadata (The "Context" Check) - Weight 0.2
        for doc_id in scores:
            doc = self.documents[doc_id]
            
            # Graph Centrality (Popular files are likely relevant)
            degree = self.graph.degree(doc_id)
            graph_boost = min(degree * 0.02, 0.1) # Cap at 0.1
            scores[doc_id] += graph_boost
            debug_scores[doc_id]['graph'] = round(graph_boost, 3)
            
            # Soft Filters (Boost/Penalize instead of Remove)
            constraint_score = 0.0
            
            # File Type Boost
            if intent.get('file_type'):
                target_ext = intent['file_type'].lower()
                if target_ext in doc['filename'].lower() or target_ext in doc['path'].lower():
                    constraint_score += 0.15
                else:
                    constraint_score -= 0.05 # Slight penalty, don't hide
            
            # Recency Boost (if requested)
            if intent.get('sort_by') == 'date':
                # Simple check: is it from 2024/2025/2026?
                if "2024" in doc['mod_time'] or "2025" in doc['mod_time'] or "2026" in doc['mod_time']:
                    constraint_score += 0.15

            scores[doc_id] += constraint_score
            debug_scores[doc_id]['boosts'] = round(constraint_score, 3)

        # 5. Final Sort
        results = []
        for doc_id, score in sorted(scores.items(), key=lambda x: x[1], reverse=True):
            if score > 0.15: # Lowered cutoff to show more results
                doc = self.documents[doc_id]
                results.append({
                    "filename": doc['filename'],
                    "path": doc['path'],
                    "score": round(score, 3),
                    "breakdown": debug_scores[doc_id],
                    "snippet": doc['preview'] + "...",
                    "mod_time": doc['mod_time']
                })
        
        return results[:10]

    def get_graph_html(self, query=None):
        from pyvis.network import Network
        net = Network(height="600px", width="100%", bgcolor="#222222", font_color="white")
        
        # Physics settings for stability
        net.force_atlas_2based()
        
        for node in self.graph.nodes(data=True):
            net.add_node(node[0], label=node[1].get('label', 'File'), title=node[1].get('label'), color="#ffc107")
            
        for edge in self.graph.edges(data=True):
            color = "gray"
            width = 1
            if edge[2]['relation'] == "VERSION_OF": 
                color = "#28a745" # Green
                width = 3
            if edge[2]['relation'] == "RELATED_TO": 
                color = "#17a2b8" # Blue
                width = 2
                
            net.add_edge(edge[0], edge[1], title=edge[2]['relation'], color=color, width=width)
            
        return net.generate_html("graph.html")