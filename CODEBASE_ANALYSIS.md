# SemanticMemoryProject - Codebase Analysis (Current Snapshot)

## Scope

This analysis reflects the current code in the workspace and was updated by cross-checking against the previous documentation version.

## What Changed Since Previous Docs

The previous docs were broadly correct on architecture, but stale in several implementation details.

Key deltas now reflected in this file:
- PDF extraction pipeline is implemented with PyMuPDF + optional OCR fallback.
- Entity extraction is regex-based and integrated directly in backend helpers.
- Search scoring includes multiple boost and penalty stages beyond the base hybrid trio.
- API surface now includes full text-file management and richer similarity/virtual-folder payloads.
- QA single-file behavior now prioritizes selected file and only falls back to version lineage.
- Frontend has evolved into a multi-workspace UI: search, graph inspector, ingest, file manager, similarity, and scoped chat.

## High-Level Architecture

Three main layers:

1. Backend engine (`backend.py`)
- indexing and chunking
- embedding generation
- BM25 indexing
- graph construction
- semantic enrichment (entities, folder profiles, topic clustering)
- hybrid retrieval
- pairwise document similarity analysis
- cache management

2. API layer (`api.py`)
- FastAPI routes for search, graph, QA, files, ingest, virtual folders, similarity, status
- response formatting tailored to frontend cards/graphs
- path safety and CRUD guardrails for managed files

3. Frontend layer (`frontend/src/App.jsx`)
- single-page dashboard with multiple operational panels
- graph visualization with custom force simulation and inspector
- QA chat popup with file scope
- in-app file management and content editor
- similarity comparison workspace and matrix view

## Backend Deep Dive (`backend.py`)

### 1) File ingestion and extraction

Core behavior:
- scans indexable files under root (excluding `.semantic_cache` and temp/hidden patterns)
- supports: `.txt`, `.md`, `.pdf`, `.docx`, `.py`, `.json`

PDF handling:
- uses PyMuPDF (`fitz`) for direct text extraction
- optional OCR via `rapidocr_onnxruntime` for pages with no extracted text
- OCR bounded by `SEMANTIC_PDF_OCR_MAX_PAGES`
- very large PDFs can be forced into metadata-only mode via byte threshold

Metadata-only fallback:
- when extraction fails/unavailable, backend synthesizes lightweight searchable text from filename/folder tokens
- document metadata records indexing mode and reason

### 2) Chunking and embeddings

Chunking:
- fixed-size chunk window (`SEMANTIC_CHUNK_SIZE`, default 300)
- overlap (`SEMANTIC_CHUNK_OVERLAP`, default 50)

Embeddings:
- SentenceTransformer model from `SEMANTIC_EMBED_MODEL` (default `BAAI/bge-small-en`)
- normalized embeddings
- document vectors are mean of member chunk embeddings

### 3) Retrieval indexes

BM25:
- chunk token index via `rank_bm25`

FAISS (optional):
- inner-product index for semantic top-k retrieval if `faiss` is available
- built from normalized chunk embeddings

Reranker (optional):
- CrossEncoder `cross-encoder/ms-marco-MiniLM-L-6-v2`
- enabled by `SEMANTIC_ENABLE_RERANK=1`

### 4) Semantic enrichment

Entity extraction:
- regex-based extraction for emails, dates, amounts, project codes, names, keywords
- stored per document and used in graph + similarity explanations

Folder semantic profiles:
- mean embedding per folder (with ancestor contribution)
- used for folder similarity and context-enriched vectors

Context enrichment:
- blended vector:
  - `final = 0.85 * doc + 0.15 * folder_profile`

Topic clustering:
- in-house k-means style clustering (no sklearn dependency for this step)
- maps document IDs to topic clusters

### 5) Graph construction

Graph type:
- `networkx.DiGraph`

Node types:
- folder nodes (`folder:<canon_path>`)
- file nodes (document IDs)

Edge types:
- `PARENT_FOLDER`, `CONTAINS_FOLDER`
- `VERSION_OF`, `CO_LOCATED`
- `SHARES_ENTITY`, `SAME_TOPIC`, `RELATED_TO`, `FOLDER_SIMILAR`

Important behavior:
- `VERSION_OF` uses normalized stem matching with suffix stripping
- `RELATED_TO` uses adaptive similarity threshold from sampled pairwise similarities
- folder-to-folder semantic links use fixed similarity threshold (`0.80`)
- PageRank computed on file-node subgraph only

### 6) Hybrid search

`hybrid_search(query_text)` combines:
- semantic score map
- BM25 score map
- graph/PageRank component
- metadata/doc-type and extension preferences
- lexical token coverage adjustments
- optional recency + version preference for latest-style intents
- optional rerank boost for top candidates

Intent handling:
- heuristic intent parser always available
- optional LLM intent parser (`phi3:mini`) for selected query patterns
- intent cache persisted in `.semantic_cache/intent_cache.json`

### 7) Similarity analysis

`compare_documents(doc_ids)` returns:
- pairwise scores
- detailed metric bundle:
  - embedding similarity
  - chunk alignment
  - calibrated semantic scores
  - divergence
  - keyword/entity overlap
- contextual explanations and matched snippet pairs
- matrix for UI rendering

Scoring is guarded against false positives by:
- semantic minimum gates
- divergence penalties
- lexical/entity sanity checks

### 8) Caching

Cache directory:
- `<root>/.semantic_cache`

Artifacts include:
- `manifest.json`
- `documents.json`
- `chunks.json`
- `chunk_embeddings.npy`
- `doc_embeddings.npy`
- `graph.json`
- `faiss.index` (if available)
- `intent_cache.json`

Invalidation key factors:
- corpus signature (paths + size + mtime)
- embedding model
- chunk size/overlap

## API Layer Deep Dive (`api.py`)

### Startup and lifecycle

- initializes `SemanticMemory` once at process startup
- root directory loaded from `config.get_root_directory()`
- CORS configured for common local frontend origins

### Endpoint groups

Search and graph:
- `GET /search`
- `GET /graph`
- `GET /debug/graph`

QA:
- `POST /qa`
  - file scope: selected file first, version-neighbor fallback only when needed
  - returns `used_fallback` and source-level `is_primary`

Virtual grouping and similarity:
- `GET /virtual-folders`
- `POST /similarity`

File management:
- `GET /files`
- `GET /files/content`
- `POST /files`
- `PUT /files/content`
- `POST /files/rename`
- `DELETE /files`
- `POST /ingest`

System:
- `POST /reindex`
- `GET /status`
- `GET /health`

### API implementation characteristics

- strict path traversal protection (`_resolve_relative_path`)
- extension allowlist for creation/editing
- automatic reindex on ingest and CRUD operations
- graph endpoint enriches nodes/edges for direct frontend rendering (layout hints, colors, relation metadata)

## Frontend Deep Dive (`frontend/src/App.jsx`)

The frontend is a single React module containing several panel components.

Primary features:
- search bar with keyboard focus shortcut
- ranked result cards with component score bars and relation tags
- detail panel with relevance breakdown
- modal file viewer
- graph panel:
  - D3-force layout
  - edge filtering
  - folder toggle
  - zoom/pan/reset
  - node inspector (entities, keywords, cluster, connections)
- ingest panel for uploads and index status
- similarity panel with pair cards and matrix
- file manager/editor panel (create/edit/rename/delete/reindex)
- floating QA chat popup with scoped questioning

Styling and UX:
- centralized token palette
- dark neon-style visual language
- responsive handling for smaller screens
- animation-heavy but deterministic transitions

## Configuration (`config.py`)

Root directory resolution order:
1. `SEMANTIC_ROOT_DIR`
2. project `test_documents` folder
3. user `Downloads`
4. user home

Also includes lightweight `.env` reader for local variable injection.

## Data and Sample Corpus

`test_documents/` includes mixed sample text, invoices, minutes, specs, and resume variants, which exercise:
- version linking
- document-type inference
- entity extraction
- folder and topic relationships

## Operational Notes

Performance-sensitive hotspots:
- embedding generation at index time
- OCR on scanned PDFs
- graph density growth for large corpora
- frontend rendering under high node/edge counts

Existing mitigations:
- cache artifacts to avoid redundant rebuilds
- top-k limits in retrieval and UI lists
- adaptive layout and render caps in graph panel

## Risks and Gaps

1. Entity extraction quality ceiling
- regex-only extraction is lightweight but less robust for nuanced named entities.

2. Single-file frontend module size
- `App.jsx` is very large, increasing maintenance burden and regression risk.

3. Startup coupling
- API startup performs model load/index initialization, which can increase boot latency.

4. Optional dependency variability
- behavior differs depending on local availability of FAISS, OCR engine, and Ollama model.

## Recommended Next Refactors

1. Split frontend monolith
- break `App.jsx` into route-level or feature-level modules.

2. Add typed API contracts
- shared schema definitions for backend/frontend payload stability.

3. Introduce incremental indexing paths
- reduce full reindex frequency on small file mutations.

4. Add regression tests
- search ranking assertions, QA scope behavior tests, and path-safety tests.

## Conclusion

Current codebase is a feature-rich local semantic memory platform with practical retrieval quality enhancements, graph-native exploration, and grounded QA. Documentation now matches the implementation details present in this workspace.
