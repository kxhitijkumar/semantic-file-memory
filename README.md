# Semantic File Memory with Relationship Graphs

A local-first, privacy-focused personal search system that turns a folder of files into a searchable knowledge graph using hybrid retrieval.

This README has been updated to reflect the optimization strategy in `OptimizationGuide-SemanticFileMemorySystem.md`.

---

## Core Capabilities

- Hybrid retrieval using BM25 + semantic vectors + graph signals
- Local intent parsing with Ollama (`phi3:mini`) for complex natural-language queries
- Knowledge graph construction for version links and semantic relationships
- Explainable ranking with score breakdowns across retrieval components
- 100% local processing (no cloud APIs)

---

## Optimization Updates

The system is now designed around these major improvements:

1. **Persistent caching layer** for embeddings, metadata, and graph artifacts
2. **FAISS-based semantic search** replacing brute-force similarity scans
3. **Upgraded embedding options** (`BAAI/bge-small-en`, `all-mpnet-base-v2`)
4. **Weighted hybrid scoring** (BM25 + semantic + graph)
5. **Document chunking** for finer-grained retrieval
6. **Selective LLM invocation** + query intent cache
7. **Graph denoising** (similarity thresholds) + PageRank-based importance
8. **Cross-encoder reranking** for improved top result ordering
9. **Parallel ingestion** for faster indexing
10. **Richer metadata extraction** for intent matching and filtering

---

## Expected Impact

- Faster startup and query response (roughly 5–20x overall, depending on data size)
- Improved ranking quality and semantic relevance
- Better scalability for larger personal document collections
- Cleaner graph relationships with stronger explainability

---

## System Architecture (Optimized)

1. **Ingestion Layer**
   - File parsing (`.txt`, `.md`, `.pdf`, `.docx`, `.py`)
   - Chunk generation
   - Parallel processing
   - Metadata extraction

2. **Indexing Layer**
   - Embedding generation (configurable model)
   - Persistent embedding cache
   - FAISS vector index build/load

3. **Retrieval & Ranking Layer**
   - BM25 candidate retrieval
   - Vector nearest-neighbor retrieval
   - Graph-aware scoring
   - Cross-encoder reranking

4. **Graph & Reasoning Layer**
   - `VERSION_OF`, `RELATED_TO`, `CO_LOCATED` edge construction
   - Similarity threshold filtering
   - PageRank centrality scoring
   - Selective LLM intent parsing + intent cache

5. **UI Layer**
   - Streamlit interface
   - Explainable result panel
   - Interactive graph visualization (PyVis)

---

## Installation

### Prerequisites
- Python 3.10+
- [Ollama](https://ollama.com/) installed and running
- Node.js 18+ (for React frontend)

### Install dependencies

```bash
pip install -r requirements.txt
```

If you are adding FAISS on Windows and face install issues, use the compatible wheel/package for your Python version.

### Pull local LLM model

```bash
ollama pull phi3:mini
```

### Install frontend dependencies

```bash
cd frontend
npm install
```

---

## Usage

### Option A: Streamlit UI (existing)

1. Place files in `test_documents/`
2. Run the app:

```bash
streamlit run app.py
```

3. Query examples:
   - "latest resume"
   - "invoice files from hosting"
   - "project specs related to privacy"

### Option B: React Frontend + FastAPI (new)

Run these in separate terminals.

1. Start the backend API:

```bash
uvicorn api:app --reload --port 8000
```

2. Start the React frontend:

```bash
cd frontend
npm run dev
```

3. Open the app at `http://localhost:5173`

The frontend uses the FastAPI endpoints:
- `GET /search?q=<query>`
- `GET /graph`
- `POST /ingest`
- `GET /status`

---

## Recommended Optimization Rollout Order

1. Persistent caching
2. FAISS integration
3. Document chunking
4. Hybrid scoring tuning
5. Embedding model upgrade
6. Reranking layer
7. LLM optimization
8. Graph improvements
9. Parallel processing
10. Metadata extraction

---

## Project Structure

```text
SemanticMemoryProject/
├── app.py
├── api.py
├── backend.py
├── requirements.txt
├── test_documents/
└── frontend/
   ├── package.json
   └── src/
```

---

## Notes for Refactoring

- Keep module boundaries clear (ingestion, retrieval, graph, UI)
- Prefer feature flags for incremental rollout
- Preserve backward compatibility with existing cached/indexed data where possible
