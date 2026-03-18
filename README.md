# Semantic File Memory with Relationship Graphs

Local-first semantic search + QA over personal documents, with hybrid retrieval, relationship graph reasoning, and a React dashboard.

---

## What's New Since the Last Push (Current Local Changes)

### Backend graph + retrieval updates

- Added folder-aware graph modeling in `backend.py`:
  - folder nodes (`type="folder"`)
  - `PARENT_FOLDER` edges (folder → file)
  - `CONTAINS_FOLDER` edges (parent folder → child folder)
- Improved version detection with exact normalized stem matching (`_norm_stem`) and stricter `VERSION_OF` behavior.
- Added adaptive semantic thresholding for `RELATED_TO` edges using the 85th percentile of sampled pairwise similarities.
- Updated PageRank computation to run on file-node subgraph only.

### API updates

- `/graph` now returns both file and folder nodes with hierarchical positioning and richer node metadata:
  - `nodeType`, `shape`, `relPath`, `docType`, `ext`, `x`, `y`
- `/graph` now includes all relationship types used by the UI:
  - `VERSION_OF`, `CO_LOCATED`, `RELATED_TO`, `PARENT_FOLDER`, `CONTAINS_FOLDER`
- Added/updated `/qa` behavior for file-scoped answers:
  - primary file is queried first
  - fallback to `VERSION_OF` neighbors only when primary evidence is weak
  - sources include `is_primary`
  - response includes `used_fallback`
  - confidence is computed primarily from primary-file chunks when available

### Frontend updates

- Major refresh in `frontend/src/App.jsx`:
  - floating AI chat popup + FAB
  - file-scoped vs all-files QA toggle in chat
  - token-stream style answer rendering
  - source chips with primary/version visual distinction
  - fallback notice when answer required version-linked files
  - improved graph controls (edge-type filter + folder visibility toggle)
- App title updated to **MemoryGraph** in `frontend/index.html`.
- Removed duplicate `frontend/src/index.html`.

---

## Core Capabilities

- Hybrid retrieval: BM25 + semantic vectors + graph signals
- Relationship graph with version, co-location, semantic, and folder-hierarchy edges
- Local QA (`phi3:mini` via Ollama) with scoped answering and source attribution
- Explainable ranking (component score breakdown)
- Local processing only (no cloud APIs)

---

## API Endpoints

- `GET /search?q=<query>` → ranked search results
- `GET /graph` → graph nodes + edges for visualization
- `POST /ingest` → upload and index supported files
- `GET /status` → index/model stats
- `GET /health` → liveness check
- `POST /qa` → scoped question-answering over indexed documents

### `/qa` request body

```json
{
  "question": "What changed between versions?",
  "scope": "file",
  "file_id": "<optional_doc_id>",
  "filename": "<optional_filename>"
}
```

---

## Installation

### Prerequisites

- Python 3.10+
- Node.js 18+
- [Ollama](https://ollama.com/) running locally

### Python dependencies

```bash
pip install -r requirements.txt
```

### Pull the local LLM

```bash
ollama pull phi3:mini
```

### Frontend dependencies

```bash
cd frontend
npm install
```

---

## Run

Use separate terminals.

### 1) API

```bash
uvicorn api:app --reload --port 8000
```

### 2) Frontend

```bash
cd frontend
npm run dev
```

Open: `http://localhost:5173`

---

## Supported File Types

`.txt`, `.md`, `.pdf`, `.docx`, `.py`, `.json`

---

## Project Structure

```text
SemanticMemoryProject/
├── api.py
├── app.py
├── backend.py
├── requirements.txt
├── test_documents/
└── frontend/
   ├── index.html
   ├── package.json
   └── src/
      ├── App.jsx
      └── main.jsx
```
