# SemanticMemoryProject - Comprehensive Codebase Analysis

## Overview

**SemanticMemoryProject** is a sophisticated, local-first semantic search and knowledge graph system for personal documents. It enables intelligent document retrieval through hybrid search (lexical + semantic + graph ranking), automatic entity extraction, relationship discovery, and AI-powered Q&A—all running locally on your machine with no cloud dependencies.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        Frontend (React/Vite)                    │
│  - Search UI with ranked result cards                            │
│  - Interactive force-directed graph visualization                │
│  - File manager (CRUD operations)                                │
│  - AI chat interface with context grounding                      │
└────────────────────┬────────────────────────────────────────────┘
                     │ HTTP (CORS-enabled)
┌────────────────────▼────────────────────────────────────────────┐
│                     API Layer (FastAPI)                          │
│  - /search endpoint (hybrid retrieval)                           │
│  - /graph endpoint (knowledge graph JSON)                        │
│  - /ingest endpoint (file upload + indexing)                    │
│  - /files endpoint (file management)                             │
│  - /qa endpoint (LLM-grounded Q&A)                               │
│  - /virtual-folders endpoint (semantic grouping)                 │
│  - /similarity endpoint (file comparison)                        │
│  - /status endpoint (index statistics)                           │
└────────────────────┬────────────────────────────────────────────┘
                     │
┌────────────────────▼────────────────────────────────────────────┐
│              Backend Engine (backend.py)                         │
│  - File extraction & chunking                                    │
│  - Vector embeddings (SentenceTransformer)                       │
│  - Lexical scoring (BM25)                                        │
│  - Knowledge graph construction (NetworkX)                       │
│  - Entity extraction (regex-based)                               │
│  - Topic clustering (k-means)                                    │
│  - Folder semantic profiling                                     │
│  - Caching (embeddings, graph, metadata)                         │
└─────────────────────────────────────────────────────────────────┘
```

---

## Core Components & Features

### 1. Backend Engine (`backend.py`)

#### A. File Processing & Extraction
- **Supported Formats**: `.txt`, `.md`, `.pdf`, `.docx`, `.py`, `.json`
- **Extraction Logic**: Type-specific parsers
  - Text formats (`.txt`, `.md`, `.py`, `.json`): Direct Unicode read
  - **PDF**: PyPDF library for page-by-page extraction
  - **DOCX**: python-docx for paragraph extraction
- **Empty File Handling**: If a file is empty, uses filename (with underscore/period conversion) as fallback content

#### B. Chunking & Context
- **Strategy**: Fixed-size chunks with overlap
  - Default chunk size: 300 tokens
  - Overlap: 50 tokens (preserves semantic context at boundaries)
  - Regex-based whitespace cleanup and tokenization
- **Purpose**: Enables fine-grained search and prevents semantic loss at chunk boundaries

#### C. Vector Embeddings
- **Model**: `BAAI/bge-small-en` (SentenceTransformer) by default, configurable via `SEMANTIC_EMBED_MODEL`
- **Approach**: Normalized cosine embeddings for semantic similarity matching
- **Caching**: All chunk and document embeddings cached as `.npy` files
- **Efficiency**: Batch encoding (batch_size=32) with multi-threaded file extraction

#### D. Lexical Scoring (BM25)
- **Algorithm**: Okapi BM25 probabilistic ranking
- **Implementation**: `rank_bm25` library
- **Purpose**: Captures keyword-heavy queries that semantic embeddings might miss
- **Hybrid Integration**: Combined with semantic + graph scores in final ranking

#### E. Optional Acceleration
- **FAISS Integration**: CPU-backed vector index for fast nearest-neighbor search
  - Auto-built if FAISS available
  - Normalized L2 vectors for compatibility
  - Callable via `/search` endpoint's fast path
- **Cross-Encoder Reranking**: Optional re-scoring of top-K results using pair-wise models
  - Enabled via `SEMANTIC_ENABLE_RERANK=1`

#### F. Semantic Enrichment Features

**Entity Extraction** (`_extract_entities`)
- Pure regex-based NLP (no spaCy dependency)
- Extracts 7 entity types:
  - **Emails**: RFC-style email patterns
  - **Dates**: Multiple formats (YYYY-MM-DD, DD/MM/YYYY, month names)
  - **Monetary amounts**: Currency symbols and codes (USD, EUR, GBP, INR, etc.)
  - **Project codes**: Ticket/version patterns (e.g., `PROJ-123`, `v2.1.3`)
  - **Names**: Capitalized multi-word proper nouns (with stop-word filtering)
  - **Organizations**: Implicit from name extraction
  - **Keywords**: TF-based high-frequency content words (stopword-filtered)

**Folder Semantic Profiles** (`_build_folder_profiles`)
- Computes mean embedding for each folder
- Aggregates vectors from all documents in that folder + ancestor folders
- Enables "folder similarity" reasoning for cross-folder relationships
- Results cached in `_folder_profiles` for graph building

**Context-Enriched Vectors** (`_context_enrich_vectors`)
- Blends document vector with its folder's semantic profile
  - Formula: `final_vec = 0.85 * doc_vec + 0.15 * folder_profile`
  - Normalizes result to unit length
- Makes embeddings more stable and meaningful across folder contexts

**Topic Clustering** (`_build_topic_clusters`)
- Simple k-means on document vectors
- Auto-selects cluster count: `k = max(2, min(sqrt(n_docs / 2), 12))`
- Uses 5 random-restart iterations for robustness
- Returns doc_id → cluster_id mapping
- Results used for `SAME_TOPIC` graph edges

#### G. Caching System
- **Cache Directory**: `.semantic_cache/` at repository root
- **Cached Artifacts**:
  - `manifest.json`: Corpus signature + model config (for cache invalidation)
  - `documents.json`: Document metadata and entities
  - `chunks.json`: Text chunks with parent IDs and tokens
  - `chunk_embeddings.npy`: NumPy matrix of chunk vectors
  - `doc_embeddings.npy`: Document-level embedding matrix (averaged from chunks)
  - `graph.json`: NetworkX graph in node-link format
  - `faiss.index`: FAISS index (if available)
  - `intent_cache.json`: LLM query intent parsing results
- **Invalidation**: Triggered by file changes (mtime check) or config changes (model/chunk size)

#### H. Graph Building (`build_graph`)
Creates a directed knowledge graph with 8 relationship types:

| Type | Direction | Purpose | Weight |
|------|-----------|---------|--------|
| **VERSION_OF** | Directed (old→new) | Tracks document revisions. Matched by normalized filename stems (suffix-stripped). | N/A |
| **CO_LOCATED** | Bidirectional | Files in same folder share context. | N/A |
| **PARENT_FOLDER** | File→Folder | Folder hierarchy. Enables folder-level scoping. | N/A |
| **CONTAINS_FOLDER** | Folder→Folder | Subfolder hierarchy. Supports recursive traversal. | N/A |
| **RELATED_TO** | Bidirectional | Semantic similarity above adaptive threshold. Core signal for thematic grouping. | Similarity score (0-1) |
| **SHARES_ENTITY** | Bidirectional | Documents mention overlapping entities (people, orgs, codes). High-precision signal. | Entity overlap proportion |
| **SAME_TOPIC** | Bidirectional | Chunk-level topic clustering (cross-folder). Fine-grained thematic links. | 0.5 (fixed) |
| **FOLDER_SIMILAR** | Bidirectional | Folders have semantic similarity ≥0.80. Groups thematically aligned folder structures. | Similarity score (0.8-1) |

**Adaptive RELATED_TO Threshold**:
- Computed as 85th percentile of sampled pairwise similarities
- Prevents over-linking in small corpuses, under-linking in large ones
- Hard-clamped between 0.88 and 0.97
- Logged at startup for transparency

**Graph Statistics**:
- Folder nodes: All directories from root to any indexed file
- File nodes: All indexed documents
- Edges: All relationships above (8 types)
- PageRank computed on file subgraph only (folders excluded)

#### I. Hybrid Search (`hybrid_search`)
Combines three ranking signals:
```
Final Score = 0.55 × BM25(query, chunks) + 0.30 × Semantic(query, chunks) + 0.15 × Graph(doc)
```

- **BM25 Score**: Lexical matching on chunks (top-50 by score)
- **Semantic Score**: Cosine similarity to query embedding (all chunks searched via FAISS if available)
- **Graph Score**: PageRank-based influence of the document in the knowledge graph
- **Component Normalization**: Per-component scores normalized to 0-1 for UI bar charts

#### J. Optional LLM Intent Parsing
- **Model**: `phi3:mini` via Ollama (local)
- **Trigger**: Queries containing "latest", "version", "recent", "pdf", "docx", "invoice", "resume", "meeting"
- **Output**: Structured intent with keywords, file_type, doc_type, sort_by, prefer_latest_version
- **Fallback**: Heuristic intent parsing (regex-based) if LLM unavailable
- **Caching**: Query-to-intent mappings cached to avoid redundant LLM calls

---

### 2. API Layer (`api.py`)

#### Core Endpoints

**GET `/search?q=<query>`**
- Hybrid retrieval with score breakdown
- Returns: `results[]` with format-ready documents
- Features:
  - Per-component score normalization
  - Relationship tags from graph edges
  - File chunk metadata
  - Mod time and extracted dates

**GET `/graph`**
- Complete knowledge graph as JSON
- Includes: nodes (files + folders), edges (8 types), hierarchical positioning
- Node features:
  - Size scaled by PageRank
  - Color by extension or document type
  - Keywords and entity lists (truncated)
  - Topic cluster assignment
- Edge metadata: Relation type, weight, optional shared entities
- Layout: Hierarchical (folders by depth, files orbiting parents)

**POST `/ingest`**
- Upload new documents with optional metadata
- Supported: `.txt`, `.md`, `.pdf`, `.docx`, `.py`, `.json`
- Automatically triggers re-indexing
- Path traversal protection via `_resolve_relative_path`

**GET `/status`**
- Index statistics: File count, model name, chunk sizes, document types
- Graph summary: Nodes, edges, edge type distribution

**GET `/qa?query=<q>&file_id=<optional>`**
- Context-grounded question answering
- Retrieves relevant chunks, feeds to Ollama
- Optional file scoping (search specific file vs. corpus-wide)
- Returns: Answer + source attribution + confidence

**GET `/virtual-folders?topic=<t>&person=<p>&relation=<r>`**
- Dynamic document grouping by semantic/entity filters
- Virtual folders created from:
  - Entity-based grouping (docs mentioning a person)
  - Topic-based grouping (docs about a topic)
  - Relation-based clustering (connected components in graph)
  - Entity suggestions (auto-detected from top entities)
- Each folder includes metadata, file count, relation type

**POST `/similarity`**
- Compare semantic similarity across 2+ files
- Returns: Pairwise similarity matrix + explanatory breakdown

**GET `/debug/graph`**
- Plain-text tree view of discovered folder structure
- Edge type distribution
- Useful for debugging misconfigured ROOT_DIR

**GET `/files`**
- Lists all indexed files with metadata
- Supports file-manager UI operations

#### Configuration & Helpers

**Root Directory**:
- Default: `./test_documents` (relative to API file)
- Configurable via `SEMANTIC_ROOT_DIR` environment variable
- Auto-created if missing

**CORS Middleware**:
- Allows requests from: `http://localhost:5173`, `http://localhost:3000`, `http://127.0.0.1:5173`
- Credentials enabled

**Helper Functions**:
- `_ext()`: Extract lowercase file extension
- `_short_path()`: Tilde-collapsed display paths
- `_resolve_relative_path()`: Path traversal protection
- `_infer_graph_positions()`: Circular layout fallback
- `_doc_matches_virtual_filters()`: Semantic filter matching
- `_build_virtual_folder_payload()`: Virtual folder construction
- `_format_result()`: Result serialization for frontend

---

### 3. Frontend (`frontend/src/App.jsx`)

#### UI Sections

**A. Search Bar** (`SearchBar` component)
- Natural-language query input
- Keyboard shortcut: `Cmd/Ctrl+K` to focus
- Real-time loading indicator
- "Clear" and "Search" buttons
- Floating placeholder text

**B. Results Panel** (`ResultCard` component)
- Ranked markdown-style cards
- Card layout:
  - File extension badge (color-coded by type)
  - Filename + final relevance score
  - File path + chunk reference + modification date
  - 2-line content snippet
  - Relationship tags (graph edges this document has)
- Selection highlighting with left border accent
- Interactive actions:
  - **View File**: Opens file content modal
  - **Ask about this file**: Activates chat with file scope
- Animation: Staggered fade-up (fu, fu1, fu2, fu3 classes)

**C. Detail Panel** (`DetailPanel` component)
- Context info for selected result:
  - Large file badge
  - Full filename + path + date
  - Relevance score circle chart (animated)
  - Score breakdown (BM25 / semantic / graph sub-scores as bars)
  - Relationship tags with edge-type coloring
  - Content preview (300-char limit)

**D. File Viewer Modal** (`FileViewer` component)
- Full-screen modal with backdrop blur
- Header: File name, extension badge, path, close button
- Content: Raw file text (code formatting preserved)
- Loading state: Animated spinner
- Responsive: Adapts to mobile (<720px)

**E. Graph Panel** (`GraphPanel` component)
- Interactive force-directed layout
  - Pan: Click-drag canvas
  - Zoom: Mouse wheel or zoom buttons
  - Reset: Restore initial view
- Node filtering:
  - Toggle folders on/off
  - Filter edges by type (ALL, VERSION_OF, CO_LOCATED, RELATED_TO, SHARES_ENTITY, SAME_TOPIC, FOLDER_SIMILAR)
- Node inspector:
  - Click to select node
  - Shows neighbors, connected edges
  - Displays node attributes (keywords, entities, cluster)
- Visual encoding:
  - **File nodes**: Circles, size ∝ PageRank, color by doc type or extension
  - **Folder nodes**: Small grey squares
  - **Edges**: Curved (semantic) vs. straight (structural), width/opacity by type
  - **Layout**: Folders in inner ring (by depth), files in outer ring (by category)
- Toolbar: Node count, edge count, zoom buttons, edge filter buttons

**F. Chat Popup** (`ChatPopup` component)
- Floating assistant for document Q&A
- Features:
  - Message history (scrollable)
  - Scope toggle (all documents vs. specific file)
  - Source chips showing retrieved context
  - Confidence feedback
  - Typing indicator while LLM responds
- FAB Button: Pulse animation when file scope active
- Animations: Pop-in/out with cubic-bezier easing

#### Design System

**Color Tokens** (`T` object):
- Background: `#07080c` (near-black)
- Surface/Panel: `#0e1017`, `#13161f` (stepping greys)
- Border: Varying opacity (0.06 to 0.16)
- Text: `#f0f2f8` (off-white)
- Accent colors: Blue, teal, amber, coral, green, violet

**Extensions Coloring**:
- `.pdf`: Coral
- `.md`: Teal
- `.docx`: Blue
- `.py`: Green
- `.txt`: Violet
- `.json`: Amber

**Edge Type Coloring**:
- `VERSION_OF`: Blue
- `CO_LOCATED`: Teal
- `RELATED_TO`: Amber
- `SHARES_ENTITY`: Coral
- `SAME_TOPIC`: Violet
- `FOLDER_SIMILAR`: Green
- `PARENT_FOLDER`: Muted grey
- `CONTAINS_FOLDER`: Darker grey

**Animations**:
- `fadeUp`: Entrance animation
- `popUp/popDown`: Modal animations
- `spin`: Loading spinner
- `pulse`: Continuous pulse
- `shimmer`: Skeleton loader
- `blink`: Cursor
- `btnPulse`: FAB button attention

#### React Hooks & State
- `useState`: Search query, results, selected result, file viewer state, chat messages, graph filters
- `useCallback`: Debounced search, memoized event handlers
- `useEffect`: Keyboard shortcuts (Cmd+K), fetch operations
- `useRef`: DOM references (search bar focus, pan start, scroll containers)
- `useMemo`: Graph positions, layout calculations

---

### 4. Streamlit App (`app.py`)

**Purpose**: Lightweight alternative UI for quick testing and development

**Features**:
- Cached backend loading (`@st.cache_resource`)
- Search interface with query input
- Result display with score breakdowns (JSON expandable)
- Knowledge graph visualization (embedded HTML)
- System status sidebar

---

## Data Flow & Integration Points

### Indexing Pipeline (on startup)
```
User specifies ROOT_DIR
    ↓
Scan for supported files (.txt, .md, .pdf, .docx, .py, .json)
    ↓
Check cache validity (signature + model config)
    ├─ If valid → Load cached artifacts, exit early
    └─ If invalid → Continue
    ↓
Extract text from each file (multi-threaded)
    ↓
Create document records (metadata, preview, timestamps)
    ↓
Chunk text (300 tokens, 50-token overlap)
    ↓
Encode chunks → SentenceTransformer embeddings
    ↓
Extract entities from text (regex-based)
    ↓
Build folder semantic profiles (mean embeddings)
    ↓
Re-encode chunks with folder context blending
    ↓
Cluster documents into topics (k-means)
    ↓
Build knowledge graph (8 relationship types)
    ↓
Compute PageRank on file subgraph
    ↓
Save cache (embeddings, graph, metadata)
```

### Search Pipeline (on query)
```
User enters query
    ↓
API receives q parameter
    ↓
Optional: LLM intent parsing (phi3:mini)
    ↓
Score chunks via BM25 (top 50)
    ↓
Score chunks via semantic similarity (all chunks)
    ↓
Fetch graph PageRank signal
    ↓
Combine scores: 0.55×BM25 + 0.30×Semantic + 0.15×Graph
    ↓
Normalize per-component scores to 0-1
    ↓
Extract relationship tags from graph
    ↓
Format results for frontend
    ↓
Return: [{ id, file, path, snippet, scores, final, tags, chunk, date, fullPath }, ...]
```

### Graph Visualization Pipeline
```
User navigates to Graph tab
    ↓
Frontend requests /graph endpoint
    ↓
Backend queries memory.graph (NetworkX)
    ↓
Compute node positions (hierarchical: folders by depth, files by category)
    ↓
Serialize nodes + edges to JSON
    ↓
Frontend receives data
    ↓
Initialize force simulation (repulsion + springs)
    ↓
Apply hierarchical layout
    ↓
Render SVG (edges first, nodes on top)
    ↓
Enable interactivity (pan, zoom, select, filter)
```

---

## Recent Additions & Advanced Features

### 1. Multi-Type Relationship Graph
- 8 relation types (not just simple "related to")
- Each type has distinct visual encoding and ranking weight
- Graph edges include metadata (weights, shared entities, cluster IDs)

### 2. Adaptive Similarity Thresholding
- Corpus-aware threshold for `RELATED_TO` edges
- Prevents over-linking in small corpuses
- 85th percentile of sampled pairwise similarities

### 3. Folder Semantic Profiling
- Computes semantic "fingerprint" for each folder
- Enables cross-folder relationship discovery
- Results in `FOLDER_SIMILAR` edges

### 4. Context-Enriched Embeddings
- Chunks re-encoded with blended folder context
- Improves stability and meaningfulness
- Better cross-folder semantic matching

### 5. Topic Clustering
- K-means on document vectors (auto k-selection)
- Creates `SAME_TOPIC` edges between documents
- Available as graph filter in UI

### 6. Entity-Based Virtual Folders
- Dynamic grouping by shared entities (people, orgs, codes)
- `/virtual-folders` endpoint detects entities and creates semantic groups
- Supports topic, person, and relation filtering

### 7. File Similarity Comparison
- `/similarity` endpoint for 2+ file comparison
- Returns pairwise matrix + explanations
- Useful for deduplication and version detection

### 8. LLM Intent Parsing
- Query-aware intent inference via Ollama
- Triggers on specific keywords (latest, version, invoice, etc.)
- Caches results to avoid redundant LLM calls

### 9. Grounded Q&A
- `/qa` endpoint with context retrieval
- File-scoped vs. corpus-wide search
- Source attribution for retrieved context

### 10. Hierarchical Graph Visualization
- Fixed layout: Folders in inner ring, files in outer rings
- Folder depth determines radial position
- High visual clarity compared to force-directed alone

### 11. Interactive Graph Filtering
- Toggle folder visibility
- Filter edges by type (8 types)
- Node selection shows neighbors and relationships

### 12. Cross-Encoder Reranking
- Optional second-pass ranking via pair-wise models
- Improves precision at cost of latency
- Configurable via `SEMANTIC_ENABLE_RERANK`

### 13. FAISS Integration
- GPU/CPU-backed vector index
- Fast nearest-neighbor search at scale
- Optional but recommended for large corpuses

### 14. Multi-Format File Support
- Text: `.txt`, `.md`, `.py`, `.json` (direct read)
- Binary: `.pdf` (page-by-page extraction)
- Office: `.docx` (paragraph extraction)
- Extensible with new parsers

---

## Configuration & Environment Variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `SEMANTIC_ROOT_DIR` | `./test_documents` | Root directory for file scanning |
| `SEMANTIC_EMBED_MODEL` | `BAAI/bge-small-en` | Embedding model name (HuggingFace) |
| `SEMANTIC_CHUNK_SIZE` | `300` | Text chunk size in tokens |
| `SEMANTIC_CHUNK_OVERLAP` | `50` | Overlap between chunks |
| `SEMANTIC_ENABLE_RERANK` | `0` | Enable CrossEncoder reranking (1=yes) |
| `SEMANTIC_ENABLE_LLM_INTENT` | `1` | Enable LLM intent parsing (1=yes) |

---

## Performance Characteristics

### Indexing
- **Multi-threaded**: Min(CPUs-1, 8) workers for file extraction
- **Embedding**: Batch size 32, normalized L2
- **Caching**: Full cache invalidation only on file changes or config updates
- **Typical Time**: Seconds to minutes depending on corpus size

### Search
- **BM25**: O(n chunks) lexical scoring
- **Semantic**: O(1) with FAISS, O(n chunks) without
- **Graph**: O(1) PageRank lookup
- **Typical Latency**: <100ms with FAISS, <500ms without

### Memory
- **Embeddings**: ~4 bytes per dimension per chunk (768 dims for bge-small = ~3KB/chunk)
- **Graph**: NetworkX adjacency structure (minimal overhead)
- **Typical**: 50-500MB for 100-1000 document corpuses

---

## Extensibility Points

1. **Custom Embedding Models**: Swap `SEMANTIC_EMBED_MODEL` (any HuggingFace model)
2. **LLM Models**: Use any Ollama-available model for Q&A (default: `phi3:mini`)
3. **Relationship Types**: Add new edge types in `build_graph()`, register colors in frontend
4. **File Format Support**: Implement new parsers in `_extract_text_from_path()`
5. **Ranking Weights**: Adjust `hybrid_search()` coefficients (0.55, 0.30, 0.15)
6. **Thresholds**: Modify `FOLDER_SIM_THRESHOLD`, percentile for `RELATED_TO`

---

## Summary of Key Capabilities

| Capability | Status | Implementation |
|---|---|---|
| Hybrid search (BM25+Semantic+Graph) | ✓ Complete | `hybrid_search()` with 3-way scoring |
| Knowledge graph (8 relation types) | ✓ Complete | `build_graph()` with adaptive thresholding |
| File ingestion (6 formats) | ✓ Complete | Type-specific parsers + re-indexing |
| AI Q&A (LLM-grounded) | ✓ Complete | Ollama integration + context retrieval |
| Entity extraction | ✓ Complete | Regex-based (no NLP libraries) |
| Topic clustering | ✓ Complete | K-means with auto k-selection |
| Graph visualization | ✓ Complete | Force-directed + hierarchical layout |
| File similarity comparison | ✓ Complete | `/similarity` endpoint |
| Virtual folder grouping | ✓ Complete | Entity/topic/relation-based |
| Interactive graph filtering | ✓ Complete | 8 edge types, folder toggle |
| Caching system | ✓ Complete | Signature-based invalidation |
| Context-enriched embeddings | ✓ Complete | Folder profile blending |
| Folder semantic profiles | ✓ Complete | Mean vector aggregation |
| Intent parsing (LLM) | ✓ Complete | phi3:mini with fallback heuristic |
| FAISS acceleration | ✓ Optional | Auto-built if available |
| CrossEncoder reranking | ✓ Optional | Configurable via env var |

---

## Files Overview

| File | LOC | Purpose |
|---|---|---|
| `backend.py` | ~1000 | Core engine (indexing, graph, search) |
| `api.py` | ~1200 | FastAPI endpoints + result formatting |
| `app.py` | ~60 | Streamlit alternative UI |
| `frontend/src/App.jsx` | ~2500 | React dashboard (search, graph, chat) |
| `requirements.txt` | - | Python dependencies |
| `frontend/package.json` | - | Node dependencies |
| `README.md` | - | User-facing documentation |

---

## Conclusion

SemanticMemoryProject is a comprehensive, production-ready local-first document intelligence system. Key strengths:

- **No Cloud Dependency**: Everything runs locally
- **Multi-Signal Ranking**: Combines lexical, semantic, and structural signals
- **Rich Relationships**: 8 graph edge types (not just one "similar" relation)
- **Adaptive Thresholding**: Corpus-aware similarity cutoffs
- **Extensible Architecture**: Easy to add new models, formats, relationship types
- **Interactive Visualization**: Full-featured graph exploration
- **Caching**: Fast repeated queries via intelligent cache invalidation
- **Grounded AI**: Q&A answers attributed to source documents
- **Entity-Aware**: Named entity extraction for high-precision linking

The system elegantly balances complexity (sophisticated ranking, rich graph) with usability (clean UI, local operation, minimal configuration).
