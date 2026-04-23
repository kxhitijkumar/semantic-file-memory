# SemanticMemoryProject

Local-first semantic document search, relationship graphing, and grounded Q&A.

This project indexes files on your machine, builds a multi-relation knowledge graph, and serves search + QA through a FastAPI backend with a React dashboard.

## Latest Documentation Update (Cross-Checked)

This README was updated after comparing the current workspace code with the previous committed documentation.

Major corrections from the previous docs:
- PDF extraction now uses PyMuPDF (`fitz`) with optional OCR fallback (`rapidocr-onnxruntime`), not `pypdf`.
- Entity extraction is regex-driven (no spaCy runtime dependency in the current backend).
- Search scoring and boosting are more detailed than a simple BM25 + semantic blend:
  - semantic, BM25, PageRank components
  - metadata/doc-type boosts
  - lexical coverage boost/penalty
  - recency/version adjustments
  - optional CrossEncoder rerank
- API now includes complete file-management endpoints (`/files`, `/files/content`, `/files/rename`, delete/create/update).
- QA file scope behavior is stricter: primary file first, fallback to `VERSION_OF` neighbors only when needed.
- Frontend has dedicated panels for graph exploration, file manager/editor, upload/indexing, virtual folders, and document similarity.

## What It Does

- Indexes supported documents under a configured root directory.
- Splits content into chunks and builds semantic embeddings.
- Builds a directed graph with structural + semantic + entity/topic relationships.
- Executes hybrid retrieval for search.
- Provides grounded QA through local Ollama (`phi3:mini`) using retrieved context only.
- Exposes REST APIs consumed by the Vite/React UI.

## Supported File Types

- `.txt`
- `.md`
- `.pdf`
- `.docx`
- `.py`
- `.json`

## Core Stack

Backend:
- FastAPI
- SentenceTransformers (`BAAI/bge-small-en` by default)
- BM25 (`rank_bm25`)
- NetworkX
- NumPy
- PyMuPDF (`pymupdf`) for PDF text
- optional RapidOCR
- optional FAISS (`faiss-cpu`)
- optional CrossEncoder reranking
- Ollama (`phi3:mini`) for QA and optional intent parsing

Frontend:
- React + Vite
- custom D3 force simulation (`d3-force`)

## Architecture

1. Indexing pipeline (`backend.py`)
- Scan files under root directory
- Extract text (metadata-only fallback when extraction fails)
- Chunk text with overlap
- Build embeddings
- Build BM25 chunk index
- Extract entities/keywords
- Build folder profiles + topic clusters
- Build graph edges
- Cache artifacts in `.semantic_cache`

2. API layer (`api.py`)
- Search, graph, QA, status, health
- Upload/ingest + reindex
- Virtual folders
- Similarity comparison
- Full file CRUD for editable text formats

3. UI layer (`frontend/src/App.jsx`)
- Search results with score breakdown
- Graph canvas with filters and node inspector
- Chat popup for scoped QA
- File viewer + in-app file manager/editor
- Similarity workspace and matrix
- Ingest dashboard

## Graph Relations

Implemented edge types:
- `VERSION_OF`
- `CO_LOCATED`
- `PARENT_FOLDER`
- `CONTAINS_FOLDER`
- `RELATED_TO`
- `SHARES_ENTITY`
- `SAME_TOPIC`
- `FOLDER_SIMILAR`

Notes:
- `RELATED_TO` threshold is adaptive per corpus (sampled pairwise similarity percentile with floor/ceiling clamps).
- PageRank is computed on file nodes (folders excluded from ranking influence).

## Search and Ranking

Search in `hybrid_search()` combines:
- semantic component
- BM25 component
- graph/PageRank component
- metadata/doc-type preferences
- lexical coverage adjustments
- optional recency/version preference for "latest" style queries
- optional CrossEncoder reranking (if enabled)

This is why results are usually more stable than pure vector or pure keyword search.

## QA Behavior

Endpoint: `POST /qa`

Behavior:
- `scope="all"`: retrieves across all indexed files.
- `scope="file"` with `file_id`:
  - primary retrieval only on selected file
  - fallback to `VERSION_OF` neighbors only if primary signal is weak
- prompt enforces context-only answering
- response returns `sources`, `confidence`, and `used_fallback`

## API Endpoints

Search and graph:
- `GET /search?q=...`
- `GET /graph`
- `GET /debug/graph`

QA and intelligence:
- `POST /qa`
- `GET /virtual-folders`
- `POST /similarity`

File management:
- `GET /files`
- `GET /files/content?path=...`
- `POST /files` (create)
- `PUT /files/content` (update)
- `POST /files/rename`
- `DELETE /files?path=...`
- `POST /ingest`

System:
- `POST /reindex`
- `GET /status`
- `GET /health`

## Configuration

The root scan directory is resolved by `config.py` in this order:
1. `SEMANTIC_ROOT_DIR`
2. project `test_documents` (if present)
3. user `Downloads`
4. user home directory

Useful environment variables:
- `SEMANTIC_ROOT_DIR`
- `SEMANTIC_EMBED_MODEL`
- `SEMANTIC_CHUNK_SIZE`
- `SEMANTIC_CHUNK_OVERLAP`
- `SEMANTIC_PDF_MAX_BYTES`
- `SEMANTIC_PDF_OCR_MAX_PAGES`
- `SEMANTIC_PDF_OCR_SCALE`
- `SEMANTIC_ENABLE_RERANK` (`0` or `1`)
- `SEMANTIC_ENABLE_LLM_INTENT` (`0` or `1`)

## Local Run

Backend setup:
```bash
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
```

Run API:
```bash
uvicorn api:app --reload --port 8000
```

Frontend setup:
```bash
cd frontend
npm install
npm run dev
```

Open:
- frontend: `http://localhost:5173`
- API docs: `http://localhost:8000/docs`

Optional Streamlit view:
```bash
streamlit run app.py
```

## Repository Layout

- `backend.py`: indexing, graph construction, retrieval, similarity logic
- `api.py`: FastAPI endpoints and response shaping for frontend
- `config.py`: root directory/environment resolution
- `app.py`: Streamlit interface
- `frontend/`: React dashboard
- `test_documents/`: sample corpus

## Known Limitations

- OCR quality depends on scanned PDF quality and optional OCR engine availability.
- Entity extraction is regex-based and may miss nuanced named entities.
- LLM features require local Ollama and `phi3:mini` availability.
- Large corpora may need tuning of chunk size, OCR limits, and reranking.

## Status

Documentation is now aligned with the current implementation state in this workspace branch.
