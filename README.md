# SemanticMemoryGraph File Exprorer

A **local-first semantic memory system** for personal documents that enables intelligent search, relationship discovery, and AI-powered Q&A entirely on your machine—no cloud APIs required.

## Core Capabilities

- **Hybrid Retrieval**: Combines BM25 lexical matching, semantic embeddings, and graph relationship signals for highly relevant results
- **Knowledge Graph Construction**: Automatically builds relationships between documents, folders, topics, and entities
- **Grounded QA**: Answers questions using only retrieved context via local Ollama (`phi3:mini`)
- **Interactive Dashboard**: React-based UI with graph visualization, search results, file management, and AI chat
- **Semantic Enrichment**: Extracts entities, profiles folder semantics, and identifies topic clusters for richer context

All processing happens locally. No data leaves your machine.

---

## 1) What this project does

SematicMemoryGraph is a personal document intelligence system that transforms a collection of files into a queryable, relationship-aware knowledge base. 

**At index time**, it:
- Extracts text from supported file types (`.txt`, `.md`, `.pdf`, `.docx`, `.py`, `.json`)
- Breaks documents into overlapping chunks to preserve context
- Generates vector embeddings using SentenceTransformer for semantic matching
- Extracts named entities, topics, and folder semantic profiles
- Builds a multi-type relationship graph (version chains, co-location, topic similarity, entity overlap, etc.)
- Caches results to avoid redundant computation on repeated runs

**At query time**, it:
- Scores documents using hybrid ranking: lexical (BM25) + semantic (embeddings) + graph signals (PageRank, relationship context)
- Displays results with confidence breakdowns so you understand why each result was ranked
- Visualizes document relationships in an interactive force-directed graph
- Allows filtering by relation type and inspecting node metadata

**For Q&A**, it:
- Retrieves relevant context based on your question
- Feeds only that context to a local LLM (`phi3:mini` via Ollama)
- Returns grounded answers with source attribution and confidence scores
- Supports both corpus-wide and file-scoped searches

---

## 2) Core architecture

### Backend engine (`backend.py`)

The backend is the heart of the system and handles all semantic processing:

- **File Extraction**: Supports `.txt`, `.md`, `.pdf`, `.docx`, `.py`, `.json`. Each file type has its own parsing logic to extract clean text while preserving structure cues.

- **Chunking with Overlap**: Documents are split into fixed-size chunks (default 300 tokens) with 50-token overlap. Overlap ensures semantic context isn't lost at chunk boundaries—key information near the end of chunk 1 is repeated in chunk 2.

- **Vector Embeddings**: Uses `BAAI/bge-small-en` (SentenceTransformer) by default to convert text into dense vectors. Embeddings capture semantic meaning, allowing "What is the invoice total?" to match documents about billing even without exact keyword overlap. The model runs locally; inference is CPU-friendly.

- **Lexical Scoring (BM25)**: Implements Okapi BM25, a probabilistic ranking function that scores documents based on keyword frequency and rarity. Combined with embeddings, BM25 catches keyword-heavy queries that pure semantic matching might miss.

- **Optional Acceleration**: 
  - FAISS (CPU-backed) indexes embeddings for fast nearest-neighbor search at scale
  - CrossEncoder optional reranking: re-scores top-K results using a pair-wise model for even higher precision

- **Semantic Enrichment** (local changes):
  - **Entity Extraction**: Identifies named entities (people, places, organizations) using spaCy. Entities become graph nodes and boost ranking when entities overlap between query and search results.
  - **Folder Semantic Profiles**: Computes a semantic embedding for each folder based on file contents. Enables "folder similarity" reasoning—grouping thematically related folders even if they share no direct overlap.
  - **Context-Enriched Vectors**: Embeds chunks with surrounding folder/topic context, making embeddings more stable and meaningful.
  - **Topic Clustering**: Groups semantically similar chunks into implicit topics. Used to build `SAME_TOPIC` relationships in the graph.

- **Knowledge Graph Construction**: Builds directed/undirected relationships linking:
  - Files to versions (`VERSION_OF`)
  - Files to parent folders (`PARENT_FOLDER`)
  - Files to co-located files (`CO_LOCATED` in same folder)
  - Documents with semantic/entity overlap (`RELATED_TO`, `SHARES_ENTITY`, `SAME_TOPIC`)
  - Folders with semantic similarity (`FOLDER_SIMILAR`)
  
  These relationships are weighted by confidence and used during ranking to boost related documents.

- **Caching**: All embeddings, graph edges, entity extractions, and metadata are cached in `.semantic_cache/` as pickled objects. On subsequent runs, if files haven't changed (checked via mtime), the cache is reused. This makes repeated queries near-instant and avoids re-embedding unchanged files.

### API layer (`api.py`)

Exposes the backend as REST endpoints (FastAPI):

- **Search endpoint**: Takes a query, routes it to backend retrieval, formats results for frontend display (including score breakdowns)
- **Graph endpoint**: Returns JSON representation of the knowledge graph (nodes, edges, coordinates for visualization)
- **File management**: CRUD operations on corpus files with automatic re-indexing
- **QA endpoint**: Accepts questions, retrieves context, calls Ollama for grounded answers
- **Debug endpoints**: Exposes graph structure, folder tree, and indexing stats for troubleshooting

CORS is configured to allow localhost frontend requests. Responses are JSON-compatible with frontend expectations.

### Frontend (`frontend/src/App.jsx`)

React-based interactive UI built with Vite:

- **Search Panel**: Text input + ranked result cards showing title, snippet, and score breakdown (BM25 / semantic / graph)
- **Graph Panel**: Force-directed graph visualization with:
  - Pan/zoom controls and node dragging/pinning
  - Filterable edges (show/hide specific relation types)
  - Node inspector: click a node to see keywords, entities, topics, and relation context
- **File Manager**: Upload new files, create/edit/delete supported text formats (`.txt`, `.md`, `.py`, `.json`), triggering automatic re-index
- **Chat Popup**: AI assistant for document Q&A with:
  - Scope toggle (search all files vs. specific file)
  - Source chips showing which documents provided context
  - Confidence and fallback notices
  - Grounded responses (only answers based on retrieved context, not model hallucigation)

### Optional Streamlit app (`app.py`)

Provides a lightweight alternative UI for quick backend interaction and testing. Useful for development and simple use cases without requiring the full React build.

---

## 3) Retrieval and QA pipeline

### Understanding Hybrid Retrieval

Traditional search relies on keywords—fast but brittle. Semantic search uses embeddings—flexible but can miss keyword-specific needs. SemanticMemoryGraph combines both plus graph signals:

```
Final Score = w₁ × BM25(query, doc) + w₂ × Semantic(query, doc) + w₃ × GraphSignal(doc)
```

Where:
- **BM25 score** (lexical): High for documents containing query keywords, especially rare ones. Detects "exact" matches.
- **Semantic similarity**: Cosine similarity between query embedding and document embedding. Catches paraphrases and synonyms.
- **Graph signal**: PageRank-inspired scoring where popular/central nodes in the graph get a boost. Leverages relationship context and cross-references.

**Why hybrid?**
- Query "What are salary ranges?" matches docs with "compensation", "pay", "wages" via semantic similarity—pure BM25 misses this.
- Query "Q3 earnings" matches docs with "earnings" via BM25. Semantic might dilute the signal if irrelevant earnings-related docs exist.
- Graph signal catches "if this is about Q3, also look at related documents about financial reporting" (e.g., documents in same folder or linked by entities).

### Graph Relations and Their Purpose

The knowledge graph connects documents using multiple relation types, each serving a specific ranking signal:

| Relation Type | Direction | Purpose |
|---|---|---|
| `VERSION_OF` | old → new | Tracks document evolution (e.g., MyResume_v1.txt → MyResume_Final.txt). Useful for finding related versions. |
| `CO_LOCATED` | bidirectional | Files in the same folder share context. Boosts related files when one is retrieved. |
| `RELATED_TO` | bidirectional | Documents with semantic similarity above adaptive threshold. Core relationship for grouping thematically similar content. |
| `PARENT_FOLDER` | file → folder | File hierarchy. Enables folder-level queries and context. |
| `CONTAINS_FOLDER` | folder → folder | Subfolder hierarchy. Allows recursive traversal and folder-level scoping. |
| `SHARES_ENTITY` | bidirectional | Documents mention overlapping entities (people, places, orgs). High precision signal: "both docs mention John Smith" is strong evidence of relatedness. |
| `SAME_TOPIC` | bidirectional | Chunk-level topic clustering identifies documents discussing same topic (e.g., invoicing). More granular than `RELATED_TO`. |
| `FOLDER_SIMILAR` | bidirectional | Folders have similar semantic profiles (computed from accumulated file semantics). Groups thematically aligned folder structures. |

**Adaptive threshold for RELATED_TO**: The semantic similarity cutoff is computed dynamically based on the distribution of all pairwise similarities in the corpus. This prevents over-linking in small corpuses and under-linking in large, diverse ones.

### QA Behavior and Grounding

The QA engine prioritizes **grounding**: answers must be supported by retrieved context, never by model hallucination.

**QA Flow**:

1. **Scope determination**: 
   - `scope="all"`: Search entire corpus
   - `scope="file"`: Search primary file first; if weak signal, fall back to `VERSION_OF` neighbors

2. **Retrieval**: Run hybrid ranking to get top-K most relevant documents/chunks

3. **Context assembly**: Pack retrieved chunks (with source attribution) into the LLM prompt

4. **LLM call**: Call `phi3:mini` via Ollama with retrieved context + question

5. **Validation**: Check that response references retrieved sources (basic sanity check)

6. **Response metadata**:
   - `sources`: Which chunks the answer drew from
   - `confidence`: Ratio of retrieval scores (higher if results were highly confident)
   - `used_fallback`: True if file-scoped search fell back to version neighbors (transparency)

**Why this approach?**
- Prevents model from inventing information not in your documents
- Makes answers auditable—you can inspect the source snippets
- Gracefully degrades: weak retrieval = low confidence, not false confidence

### Caching and Re-indexing

On first run or if files change (mtime-based detection):
1. Extract text from all files
2. Chunk and embed (most expensive step)
3. Compute BM25 index
4. Extract entities and topics
5. Build graph edges
6. Save to cache

On subsequent runs, cached embeddings/graph are reused if files haven't changed. Clearing `.semantic_cache/` forces a full re-index (useful if you change embedding models or chunking parameters).

---

## 3.5) Use Case Examples

**Use Case 1: Resume Matching**
- Index multiple resume versions and cover letters
- Query: "What are my relevant data science experiences?"
- System retrieves chunks from all resumes where spaCy extracted "data science" or semantically similar terms (ML, analytics, etc.)
- Graph boosts earlier versions linked via `VERSION_OF`
- LLM synthesizes answer: "You have 3 years data science experience from..."

**Use Case 2: Meeting Minutes Exploration**
- Index meeting notes across months (January_Minutes, February_Minutes, etc.)
- Query: "What decisions were made about infrastructure?"
- BM25 catches "infrastructure" keyword
- Semantic similarity catches related chunks about DevOps, servers, deployment without those exact words
- Graph signal boosts files in the same (Meetings) folder
- Results thread together related decisions across months

**Use Case 3: Project Specification Navigation**
- Index project specs, design docs, requirements, and related meeting notes
- Query: "Show me the architecture diagram and related decisions"
- Semantic search catches design doc chunks about architecture
- `SHARES_ENTITY` links docs mentioning same components (microservices, databases)
- `RELATED_TO` groups thematically similar docs
- Graph visualization shows how spec relates to decision logs

---

## 4) Troubleshooting & FAQ

**Q: Why isn't my document appearing in search results?**
- Check if the file format is supported (`.txt`, `.md`, `.pdf`, `.docx`, `.py`, `.json`)
- Verify the file is in the corpus directory (`test_documents/` by default or custom via `SEMANTIC_ROOT_DIR`)
- If indexing recently completed, the cache might be stale; try clearing `.semantic_cache/` and restarting
- Check backend logs for parse errors (corrupt PDF, encoding issues, etc.)

**Q: Graph visualization is empty or has few connections**
- Corpus is too small or too dissimilar (less than 50 documents, or no entity/topic overlap)
- Try lowering the `RELATED_TO` threshold in `backend.py`—search for `adaptive_threshold`
- Add more related documents to give the system connections to find

**Q: Queries are slow / embedding generation takes forever**
- First run always embeds all documents (expensive). Subsequent runs use cache—should be instant for unchanged files.
- Enable FAISS (`pip install faiss-cpu` + no env var needed) for faster similarity search
- If corpus is > 10K documents, consider using a GPU-based setup or switching to a smaller embedding model

**Q: How do I use custom embedding models?**
- Set the env var: `export SEMANTIC_EMBED_MODEL=sentence-transformers/all-MiniLM-L6-v2`
- Clear `.semantic_cache/` to force re-embedding
- Smaller models (MiniLM) are faster but less accurate; larger (bge-large) are more accurate but slower

**Q: File manager UI shows "editable unavailable"**
- Only `.txt`, `.md`, `.py`, `.json` are editable via the UI
- Other formats (PDF, DOCX) can be uploaded and indexed but not edited—use your file manager directly

**Q: QA is giving wrong answers**
- Check retrieved sources (visible in UI) to see if context is relevant
- If context is irrelevant, the retrieval ranking needs tuning (adjust BM25/semantic/graph weights in `api.py`)
- If context is relevant but LLM is misinterpreting, try rephrasing the question or limiting the scope to a specific file

---

## 5) API reference

Base URL (dev): `http://localhost:8000`

### Search and Retrieval

- **`GET /search?q=<query>`**
  - Performs hybrid search across all indexed documents
  - Returns ranked results formatted for UI cards
  - Response includes: chunk content, document metadata, score breakdown (BM25 / semantic / graph), confidence
  - Example: `GET /search?q=What%20are%20invoicing%20procedures`

### Graph Visualization and Inspection

- **`GET /graph`**
  - Returns complete knowledge graph as JSON nodes/edges with metadata
  - Each node includes: document ID, title, keywords, extracted entities, semantic topics, cluster assignments
  - Each edge includes: relation type, weight (confidence), direction
  - Includes force-directed layout coordinates for visualization
  - Used by graph panel to render interactive graph

- **`GET /debug/graph`**
  - Returns debug information: folder tree structure, graph statistics, relation type counts, entity extraction summary
  - Useful for troubleshooting graph construction or verifying indexing completeness

### File Management (CRUD)

- **`GET /files`**
  - Lists all indexed/manageable files with metadata
  - Response includes: path, extension, size, last modified time, whether file is editable
  - Editable files: `.txt`, `.md`, `.py`, `.json`
  - Non-editable but indexable: `.pdf`, `.docx`

- **`GET /files/content?path=<relative_path>`**
  - Retrieves UTF-8 content for editable file types
  - Example: `GET /files/content?path=resumes/MyResume_Final.txt`
  - Returns raw text content (not embedded)

- **`POST /files`**
  - Creates a new file under the corpus root, then triggers re-indexing
  - Request body:
    ```json
    {
      "path": "notes/today.md",
      "content": "# Notes\nMy thoughts..."
    }
    ```
  - Returns new file metadata after indexing completes

- **`PUT /files/content`**
  - Updates content of an editable file, then triggers re-indexing
  - Body:
    ```json
    {
      "path": "notes/today.md",
      "content": "Updated content with new thoughts..."
    }
    ```
  - Returns updated file metadata and indexing status

- **`DELETE /files?path=<relative_path>`**
  - Deletes a file from corpus and removes from index/graph
  - Example: `DELETE /files?path=draft_notes.txt`
  - Returns success confirmation

- **`POST /ingest`**
  - Multipart file upload; saves to corpus directory and re-indexes
  - Supports all indexed file types
  - Useful for adding documents via UI file drop zone

### Indexing Control

- **`POST /reindex`**
  - Forces a complete re-index of all documents in corpus directory
  - Clears embeddings cache and rebuilds graph from scratch
  - Use when you manually add files to disk or change embedding model settings
  - Long-running operation (blocks until completion)

- **`GET /status`**
  - Returns indexing statistics and configuration
  - Response includes: total documents, total chunks, graph node/edge counts
  - Model configuration (embedding model, chunk size, overlap)
  - Cache status

### Health and Diagnostics

- **`GET /health`**
  - Simple liveness check; returns 200 OK if API is running
  - Useful for load balancers and monitoring

### Question Answering

- **`POST /qa`**
  - Submit a question for grounded QA using retrieved context + local LLM
  - Request body:
    ```json
    {
      "question": "What changed between resume versions?",
      "scope": "all",
      "file_id": "<optional_doc_id>",
      "filename": "<optional_filename>"
    }
    ```
  - `scope`: `"all"` (search entire corpus) or `"file"` (search specific file first, fallback to versions)
  - `file_id` or `filename`: Required if `scope="file"`
  - Response includes: answer text, source chunks with attribution, confidence score, fallback flag

---

## 6) Setup

### Prerequisites
- **Python 3.10+** (for backend and Ollama integration)
- **Node.js 18+** (for React frontend)
- **Ollama** running locally (get from [ollama.ai](https://ollama.ai))
  - Ollama provides the `phi3:mini` LLM used for grounded QA
  - Must be running on default port 11434 for the backend to connect

### Installation Steps

**1. Clone and navigate to project**
```bash
cd SemanticMemoryProject
```

**2. Install Python dependencies**
```bash
pip install -r requirements.txt
```

This installs:
- `fastapi`, `uvicorn` — API framework
- `sentence-transformers` — embedding model
- `scikit-learn` — BM25 implementation and clustering
- `spacy` — entity extraction
- `networkx` — graph operations
- `requests` — HTTP calls to Ollama
- Optional: `faiss-cpu` for faster similarity search, `CrossEncoder` for reranking

**3. Download spaCy language model** (needed for entity extraction)
```bash
python -m spacy download en_core_web_sm
```

**4. Pull Ollama LLM** (local AI model)
```bash
ollama pull phi3:mini
```

**5. Install frontend dependencies**
```bash
cd frontend
npm install
```

---

## 7) Run locally

Use **separate terminals** for each component (they run in parallel).

### Terminal 1: Start Ollama
```bash
ollama serve
```
This starts the Ollama server on `http://localhost:11434` (default). Keep this running.

### Terminal 2: Start FastAPI backend
```bash
uvicorn api:app --reload --port 8000
```
- `--reload` enables auto-restart on code changes (dev convenience)
- Backend connects to Ollama at `http://localhost:11434`
- Check `http://localhost:8000/health` to verify it's running

### Terminal 3: Start React frontend
```bash
cd frontend
npm run dev
```
- Vite dev server starts at `http://localhost:5173`
- Opens auto-reload and HMR (hot module replacement) for live development
- Makes requests to backend at `http://localhost:8000`

### Open in browser
Navigate to: **`http://localhost:5173`**

You should see:
- Search panel (top left)
- Graph visualization (center)
- File manager (top right)
- Chat button (bottom right)

### Optional: Streamlit UI
For quick testing without React, start Streamlit in **Terminal 4**:
```bash
streamlit run app.py
```
Opens at `http://localhost:8501`. Lightweight but less feature-rich than React UI.

---

## 8) Environment variables

Configure these via shell exports or `.env` file before starting the API.

### API Configuration

- **`SEMANTIC_ROOT_DIR`** (default: `./test_documents`)
  - Path to the corpus directory (relative to project root or absolute)
  - All indexed files must be within this directory
  - Example: `export SEMANTIC_ROOT_DIR=/home/user/my_documents`

- **`SEMANTIC_OLLAMA_URL`** (default: `http://localhost:11434`)
  - URL where Ollama server is running
  - Change this if Ollama is on a different host or port
  - Example: `export SEMANTIC_OLLAMA_URL=http://192.168.1.100:11434`

### Backend Embedding and Indexing

- **`SEMANTIC_EMBED_MODEL`** (default: `BAAI/bge-small-en`)
  - SentenceTransformer model for generating embeddings
  - Smaller = faster but less accurate; larger = more accurate but slower
  - Examples:
    - `sentence-transformers/all-MiniLM-L6-v2` (super fast, 384-dim)
    - `BAAI/bge-small-en` (default, balanced, 384-dim)
    - `BAAI/bge-large-en` (high quality, slower, 1024-dim)
  - ⚠️ Changing this requires clearing `.semantic_cache/` to force re-embedding

- **`SEMANTIC_CHUNK_SIZE`** (default: `300`)
  - Maximum tokens per document chunk
  - Smaller chunks = more retrieval precision but higher storage
  - Larger chunks = more context but potential loss of specificity
  - Recommended range: 200–500
  - ⚠️ Changing this requires clearing cache and re-indexing

- **`SEMANTIC_CHUNK_OVERLAP`** (default: `50`)
  - Overlap in tokens between consecutive chunks
  - Prevents semantic context loss at chunk boundaries
  - Recommended: 10–20% of chunk size
  - ⚠️ Changing this requires clearing cache and re-indexing

- **`SEMANTIC_ENABLE_RERANK`** (default: `0`)
  - `1` to enable CrossEncoder reranking (more accurate but slower)
  - `0` to use BM25 + semantic similarity only (faster, usually sufficient)
  - Only use if retrieval accuracy is critical and latency acceptable
  - Requires: `pip install sentence-transformers[torch]` and CUDA for speedup

- **`SEMANTIC_ENABLE_LLM_INTENT`** (default: `1`)
  - `1` to enable LLM-based query intent detection (current date, entity types)
  - `0` to disable (slight speedup, less ranking nuance)

### Example `.env` file
```bash
SEMANTIC_ROOT_DIR=/home/user/my_research_papers
SEMANTIC_EMBED_MODEL=BAAI/bge-large-en
SEMANTIC_CHUNK_SIZE=400
SEMANTIC_CHUNK_OVERLAP=75
SEMANTIC_ENABLE_RERANK=1
SEMANTIC_ENABLE_LLM_INTENT=1
```

---

## 9) Project structure

```text
SemanticMemoryProject/
├── api.py
├── app.py
├── backend.py
├── requirements.txt
├── README.md
├── test_documents/
│   ├── ...
└── frontend/
    ├── index.html
    ├── package.json
    ├── vite.config.js
    └── src/
        ├── App.jsx
        └── main.jsx
```

---

## 10) Changes from start (full evolution)

Based on git history and current local workspace changes.

### Git timeline

1. **first commit** (Baseline)
   - Initial backend with file extraction, basic chunking, BM25 indexing
   - Early FastAPI endpoints for search
   - React UI with basic search panel

2. **optimization pass** (Performance)
   - Introduced retrieval optimization techniques
   - Improved chunking strategy and indexing speed
   - Foundation for scalability improvements

3. **performance optimizations v2** (Caching & Acceleration)
   - Added `.semantic_cache/` caching system to avoid redundant computation
   - Integrated FAISS for O(log n) similarity search on large corpuses
   - Chunking improvements for better context preservation
   - Result: Repeated queries 10-100x faster than first run

4. **Version 3.0** (Graph v1)
   - Introduced basic knowledge graph with `VERSION_OF`, `CO_LOCATED`, `PARENT_FOLDER` relations
   - Graph signal integrated into retrieval ranking
   - Improved document relationship discovery

5. **Version 4.0** (Current committed HEAD)
   - Latest stable release before local development changes
   - Refined graph architecture and retrieval weights

### Current local (uncommitted) changes — Version 4.1+ (Semantic Enrichment)

These are the latest enhancements not yet committed to git:

#### `backend.py` — Semantic Enrichment
**Goal**: Add deeper semantic understanding to improve ranking and relationship discovery

- **Entity Extraction** (using spaCy)
  - Identifies named entities: people, locations, organizations
  - Creates `SHARES_ENTITY` edges between documents mentioning same entities
  - Why: "Both docs mention 'John Smith' and 'Acme Corp'" is strong evidence of relatedness
  - Effect: LLM queries like "What did John do?" now connect historical references

- **Folder Semantic Profiles**
  - Aggregates embeddings of all files in a folder to create a folder-level vector
  - Enables `FOLDER_SIMILAR` edges between thematically related folder structures
  - Why: Folders like `/archive/Q1_reports/` and `/archive/Q2_reports/` should be connected
  - Effect: Searching Q1 documents suggests related Q2 findings

- **Context-Enriched Vectors**
  - Augments chunk embeddings with surrounding folder/document/topic context during encoding
  - Improves embedding stability (chunks near similar neighbors embed closer)
  - Why: Pure chunk embeddings can be noisy; context makes them more meaningful
  - Effect: Semantic search is more precise and robust to out-of-context chunks

- **Topic Clustering**
  - Runs unsupervised clustering (K-means) on document embeddings
  - Creates `SAME_TOPIC` edges grouping semantically similar documents
  - Why: "Topic" is coarser than `RELATED_TO` but faster to compute and more interpretable
  - Effect: Users can explore "similar documents" at different granularities

- **Adaptive Relation Thresholding**
  - `RELATED_TO` threshold is computed dynamically from corpus statistics
  - Small corpus → lower threshold (connect more), large corpus → higher threshold (connect only strong matches)
  - Why: Fixed thresholds over-link small corpuses and under-link large ones
  - Effect: Graph density stays proportional to corpus size; no tuning needed per corpus

#### `api.py` — Rich Graph and QA

- **Enhanced `/graph` response**
  - Node metadata: keywords (TF-IDF), extracted entities, topic cluster assignment, folder profile
  - Edge metadata: relation type, confidence weight, bidirectional flags
  - Why: Frontend needs this for rich node inspector, edge legend, and filtering
  - Effect: Graph UI can show "This document mentions 5 people, 3 organizations, belongs to project-planning cluster"

- **New `GET /debug/graph` endpoint**
  - Exposes folder tree structure and indexing statistics
  - Returns relation type distribution, entity extraction summary, graph density
  - Why: Helps debug indexing issues and validate graph quality
  - Effect: Contributors can verify graph construction without diving into code

- **Stricter file-scoped QA**
  - `scope="file"`: Searches primary file first; if weak signal (low confidence), falls back to `VERSION_OF` neighbors only
  - Fallback stays scoped to versions, not entire corpus (preserves file-scoped intent)
  - Response flags `used_fallback` for transparency
  - Why: Users expect "file scope" to mean that file, not just its close neighbors
  - Effect: Better user control; can see when system had to look beyond primary file

#### `frontend/src/App.jsx` — Advanced UI

- **Graph Panel Improvements**
  - Force-directed simulation (D3.js) with pan, zoom, drag, pin (fix node in place)
  - Edge filtering: Toggle relation types on/off to reduce visual clutter
  - Node inspector: Click node → see keywords, entities, cluster, relations (right panel)
  - Why: Static graphs are hard to read; interaction + filtering + inspection make relationships discoverable
  - Effect: Users explore non-obvious connections, e.g., "I didn't know these two projects share team members"

- **Chat Popup Enhancements**
  - File vs. corpus scope toggle in chat interface
  - Source chips colorized by relation type and confidence
  - Displays "Fallback used" notice when file scope fell back to neighbors
  - Why: Users need transparency into what context LLM used and how confident the system is
  - Effect: Better understanding of LLM decisions, easier to refine follow-up questions

#### Misc Changes
- **App title**: Updated `frontend/index.html` title to "SemanticMemoryGraph" (brand rename)
- **Presentation**: Added `.pptx` project overview in workspace root (for demos/documentation)

---

## 11) Supported file types

`txt`, `md`, `pdf`, `docx`, `py`, `json`

---

## 12) Notes for contributors

### Architecture Principles

The system is built on **clean separation of concerns**:
- **Backend** (`backend.py`): Pure logic—indexing, retrieval, graph construction. No HTTP/frontend bias.
- **API** (`api.py`): Thin adapter layer—formats backend output for frontend. No business logic.
- **Frontend** (`App.jsx`): Presentation only—displays backend data. No retrieval or ranking logic.

**When adding features, respect these boundaries.** If you add a new relation type or ranking signal:
1. Implement it in `backend.py` (edge generation or score computation)
2. Expose it via `api.py` (return in `/graph` or `/search` response)
3. Consume it in `App.jsx` (display, filter, inspect)

### Schema Alignment

The **API response schema** is the contract between backend and frontend. 

- **Graph response schema**: Ensure backend `_build_graph()` and API `/graph` return matching node/edge structures
- **Search response schema**: Ensure score breakdown fields are populated by backend and rendered by frontend
- **QA response schema**: Ensure sources, confidence, and fallback flags are present in response

**After schema changes**: Document in comments and update both backend + frontend (not just one)

### Relation Types Maintenance

When adding new relation types (e.g., `SHARES_AUTHOR`, `MENTIONS_COMPANY`):

1. **In `backend.py`**:
   - Add edge generation logic in graph construction
   - Document direction, weight computation, and filtering thresholds
   - Example:
     ```python
     # Add SHARES_AUTHOR edges
     if doc_a.authors & doc_b.authors:  # Intersection of author sets
         weight = len(author_overlap) / len(doc_a.authors | doc_b.authors)
         graph.add_edge(doc_a_id, doc_b_id, type="SHARES_AUTHOR", weight=weight)
     ```

2. **In `api.py`**:
   - Assign color/icon/legend entry
   - Example:
     ```python
     RELATION_COLORS = {
         "SHARES_AUTHOR": "#FF6B6B",
         "SHARES_ENTITY": "#4ECDC4",
         ...
     }
     ```

3. **In `App.jsx`**:
   - Add to edge filter checkboxes
   - Update graph legend
   - Update node inspector to show relation counts
   - Example:
     ```jsx
     <EdgeFilter label="Shares Author" type="SHARES_AUTHOR" />
     ```

### Performance Considerations

- **Caching**: Always use `.semantic_cache/`. Measure first-run vs. repeated-run times to justify changes.
- **Graph size**: Document expected node/edge counts for reference corpuses. Monitor growth.
- **Embedding cost**: This is the bottleneck. Profile before/after if changing models or chunking.
- **Query latency**: Aim for < 500ms p95 for `/search`. Use spaCy NER's lazy loading to save startup time.

### Testing Recommendations

Add these manual tests when extending functionality:

1. **Small corpus** (3–5 files): Verify entity extraction, topic clustering, relation thresholds
2. **Medium corpus** (50–100 files from different domains): Test graph density, search accuracy
3. **Version testing**: Ensure `VERSION_OF` edges connect historical file chains correctly
4. **Folder hierarchy**: Test `PARENT_FOLDER` and `CONTAINS_FOLDER` with nested structures
5. **QA grounding**: Verify answers don't hallucinate; sources are traced to retrieved chunks

### Debugging Tips

- **Enable verbose logging**: Add `logging.basicConfig(level=logging.DEBUG)` to `backend.py`
- **Inspect cache**: Use Python to load `.semantic_cache/embeddings.pkl` and check structure
- **Test `/debug/graph`**: Run `curl http://localhost:8000/debug/graph | jq` to inspect graph structure
- **Profile embedding**: Use `time` in Python: `start=time.time(); embeddings=model.encode(...); print(time.time()-start)`
- **Frontend graph stability**: If graph visualization is jittery, increase physics simulation steps (D3 config)

### Known Limitations

- **Entity extraction**: Depends on spaCy NER quality. May miss domain-specific entities. Consider fine-tuned models for specialized corpuses.
- **Adaptive thresholds**: Works well for 10–10K documents. Extremely small (<10) or large (>100K) corpuses may need manual tuning.
- **Semantic enrichment cost**: Folder profiles, topic clustering, context-enrichment are computed post-indexing. First-run scales O(n²) for graph edges.
- **Local LLM latency**: `phi3:mini` is fast but lightweight. Answers may be less nuanced than larger models. Consider `mistral:7b` or similar for higher quality.

### Future Enhancement Ideas

- **Temporal relationships**: Add `UPDATED_FROM` edges tracking document edit history
- **Multi-hop reasoning**: Propagate PageRank through `VERSION_OF` chains to surface historically important versions
- **Interactive refinement**: Let users add/remove graph edges manually to train ranking weights
- **Hybrid vector-BM25 reranker**: Train a small supervised model to weight BM25 vs. semantic signals per query type
- **Federated indexing**: Support multiple corpora with cross-corpus search
- **GraphRAG**: Implement larger LLM-guided graph augmentation (e.g., semantic triples extracted by LLM)

---

## 13) Quick Start Checklist

Get SemanticMemoryGraph running in 5 minutes:

- [ ] **Prerequisites installed**: Python 3.10+, Node.js 18+, Ollama
- [ ] **Clone repo** and `cd SemanticMemoryProject`
- [ ] **Python setup**: `pip install -r requirements.txt` && `python -m spacy download en_core_web_sm`
- [ ] **Ollama**: Run `ollama pull phi3:mini` and start `ollama serve` in a terminal
- [ ] **Frontend**: `cd frontend && npm install`
- [ ] **Start backend**: `uvicorn api:app --reload --port 8000` (separate terminal)
- [ ] **Start frontend**: `cd frontend && npm run dev` (another terminal)
- [ ] **Open browser**: Navigate to `http://localhost:5173`
- [ ] **Try a search**: Type a query in search panel
- [ ] **Test Q&A**: Click chat button (bottom right) and ask a question

**First-run notes**:
- Initial indexing of `test_documents/` takes ~30 seconds (embedding is slow)
- Subsequent runs are instant (cache reuse)
- Graph visualization may show limited edges if corpus is small (add more files to see connections)

---

## 14) License & Support

**License**: This project is provided as-is. Modify and distribute freely for personal/research use.

**Questions or Issues?**
- Check **Section 4: Troubleshooting** above
- Enable logging by setting `logging.basicConfig(level=logging.DEBUG)` in code
- Inspect `.semantic_cache/` structure to verify indexing worked
- Test individual components: `/health` for API, `/status` for backend state, `/debug/graph` for graph inspection

**Contributing**:
- Follow architecture principles in Section 12
- Maintain schema alignment between backend/API/frontend
- Test with multiple corpus sizes
- Document new relation types and env variables

---

## 15) Acknowledgments

Built with:
- **SentenceTransformer** (`BAAI/bge-small-en`) for embeddings
- **spaCy** for entity extraction and NLP
- **scikit-learn** for BM25 and clustering
- **FastAPI** for REST API
- **React + D3.js** for graph visualization
- **Ollama** for local LLM integration

SemanticMemoryGraph combines proven IR/NLP techniques with modern web UI for a privacy-first personal knowledge system.

