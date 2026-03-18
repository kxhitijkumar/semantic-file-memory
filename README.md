# MemoryGraph (SemanticMemoryProject)

Local-first semantic memory system for personal documents.

It combines:
- hybrid retrieval (BM25 + embeddings + graph signals),
- relationship-aware document graphing,
- grounded local QA via Ollama (`phi3:mini`), and
- an interactive React graph/search/chat dashboard.

No cloud APIs are required for core usage.

---

## 1) What this project does

MemoryGraph indexes files from a local root folder and builds:
- **document chunks** for retrieval,
- **vector embeddings** for semantic matching,
- a **knowledge graph** that links files/folders/versions/topics,
- and a **QA layer** that answers questions from retrieved context only.

You can:
- search with natural language,
- inspect score breakdowns (BM25 / semantic / graph),
- visualize relationships in a force graph,
- upload new files and re-index,
- and ask file-scoped or corpus-wide questions.

---

## 2) Core architecture

### Backend engine (`backend.py`)
- File extraction from `.txt`, `.md`, `.pdf`, `.docx`, `.py`, `.json`
- Chunking with overlap
- SentenceTransformer embeddings (`BAAI/bge-small-en` by default)
- BM25 lexical scoring
- Optional FAISS acceleration (`faiss-cpu`)
- Optional reranking (`CrossEncoder`)
- Graph construction with multiple relation types
- Caching in `.semantic_cache/` to avoid full re-index on each run

### API layer (`api.py`)
- FastAPI endpoints for search, graph, ingest, status, health, QA
- CORS enabled for local frontend development
- Formats backend output for frontend-compatible payloads

### Frontend (`frontend/src/App.jsx`)
- Search + ranked result list + score detail panel
- Interactive graph with filters and node inspector
- File upload panel
- AI chat popup with source chips and confidence display

### Optional Streamlit app (`app.py`)
- Lightweight interface for quick backend interaction/testing

---

## 3) Retrieval and QA pipeline

### Hybrid retrieval
Final ranking combines:
- **BM25 score** (lexical relevance)
- **semantic similarity** (embedding-based)
- **graph signal** (PageRank / relationship context)

Additional boosts apply for intent hints like recency/type when available.

### Graph relations used
- `VERSION_OF` (directed old → newer)
- `CO_LOCATED` (same folder)
- `RELATED_TO` (semantic similarity above adaptive threshold)
- `PARENT_FOLDER` (folder → file)
- `CONTAINS_FOLDER` (folder → child folder)
- `SHARES_ENTITY` (overlapping extracted entities)
- `SAME_TOPIC` (cluster-level relation)
- `FOLDER_SIMILAR` (semantic folder-profile relation)

### QA behavior (`POST /qa`)
- `scope="all"`: searches all indexed files
- `scope="file"`: searches primary file first
- fallback to `VERSION_OF` neighbors only when primary file signal is weak
- answers are constrained to retrieved context
- response returns sources, confidence, and fallback flag

---

## 4) API reference

Base URL (dev): `http://localhost:8000`

- `GET /search?q=<query>`
  - Returns ranked results formatted for UI cards

- `GET /graph`
  - Returns graph nodes/edges with node metadata and coordinates

- `GET /debug/graph`
  - Returns folder-tree/debug stats for graph troubleshooting

- `POST /ingest`
  - Multipart upload; saves files to root corpus directory and re-indexes

- `GET /status`
  - Returns document/chunk/graph counts + model/index config

- `GET /health`
  - Simple liveness check

- `POST /qa`
  - Request body:

```json
{
  "question": "What changed between versions?",
  "scope": "file",
  "file_id": "<optional_doc_id>",
  "filename": "<optional_filename>"
}
```

---

## 5) Setup

### Prerequisites
- Python 3.10+
- Node.js 18+
- Ollama running locally

### Install Python dependencies
```bash
pip install -r requirements.txt
```

### Pull local LLM
```bash
ollama pull phi3:mini
```

### Install frontend dependencies
```bash
cd frontend
npm install
```

---

## 6) Run locally

Use separate terminals.

### Start API
```bash
uvicorn api:app --reload --port 8000
```

### Start frontend
```bash
cd frontend
npm run dev
```

Open: `http://localhost:5173`

### Optional: Streamlit UI
```bash
streamlit run app.py
```

---

## 7) Environment variables

### API
- `SEMANTIC_ROOT_DIR` (default: `./test_documents` from project root)

### Backend engine
- `SEMANTIC_EMBED_MODEL` (default: `BAAI/bge-small-en`)
- `SEMANTIC_CHUNK_SIZE` (default: `300`)
- `SEMANTIC_CHUNK_OVERLAP` (default: `50`)
- `SEMANTIC_ENABLE_RERANK` (`0` or `1`, default `0`)
- `SEMANTIC_ENABLE_LLM_INTENT` (`0` or `1`, default `1`)

---

## 8) Project structure

```text
SemanticMemoryProject/
├── api.py
├── app.py
├── backend.py
├── requirements.txt
├── README.md
├── test_documents/
│   ├── Invoice_Hosting_Service.txt
│   ├── Meeting_Minutes_Jan.txt
│   ├── Project_Specs.txt
│   └── resumes/
└── frontend/
    ├── index.html
    ├── package.json
    ├── vite.config.js
    └── src/
        ├── App.jsx
        └── main.jsx
```

---

## 9) Changes from start (full evolution)

Based on git history and current local workspace changes.

### Git timeline

1. **`08434f2` — first commit**
   - Initial project baseline (backend + early app structure)

2. **`578604c` — optimization pass**
   - Introduced retrieval/index performance improvements

3. **`522e1d2` — performance optimizations (Version 2 branch point)**
   - Added FAISS, caching, and chunking improvements
   - Better indexing speed and repeated-run behavior

4. **`963a962` — Version 3.0**
   - Advanced graph and retrieval iteration on top of V2

5. **`0933c63` — Version 4.0 (current HEAD)**
   - Latest committed release state before local-only edits

### Current local (uncommitted) changes

#### `backend.py`
- Added semantic enrichment pass after indexing:
  - entity extraction
  - folder semantic profiles
  - context-enriched vectors
  - topic clustering
- Expanded graph with richer relation logic:
  - added `SHARES_ENTITY`, `SAME_TOPIC`, `FOLDER_SIMILAR`
  - strengthened folder hierarchy handling via canonical paths
  - adaptive `RELATED_TO` thresholding retained/improved

#### `api.py`
- `/graph` now exposes richer node/edge metadata for UI inspector
- Added support for displaying advanced semantic relation types
- Added `GET /debug/graph`
- QA flow updated to be stricter for file scope:
  - primary-file-first retrieval
  - fallback only to version neighbors
  - `is_primary` source flag
  - `used_fallback` response field

#### `frontend/src/App.jsx`
- Graph panel upgraded:
  - force simulation, pan/zoom, node pinning/selection behavior
  - richer edge filters (`SHARES_ENTITY`, `SAME_TOPIC`, etc.)
  - detailed node inspector (keywords/entities/cluster)
- Chat popup improvements:
  - scoped file/all QA
  - fallback notice
  - confidence chip + richer source display

#### Misc
- App title set to **MemoryGraph** in `frontend/index.html`
- Added project presentation file in workspace (`.pptx`)

---

## 10) Supported file types

`txt`, `md`, `pdf`, `docx`, `py`, `json`

---

## 11) Notes for contributors

- Keep graph and API payload schema aligned with frontend expectations.
- If you add relation types, update:
  - backend edge generation,
  - API color/type mapping,
  - frontend legend/filter/inspector handling.
- If model/chunk settings change, clear `.semantic_cache/` to force clean re-index.

