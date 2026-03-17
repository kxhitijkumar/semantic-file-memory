"""
api.py — FastAPI wrapper for SemanticMemory backend.

Drop this file in your project root (alongside backend.py).
Run with:  uvicorn api:app --reload --port 8000

The React frontend (Vite, localhost:5173) talks to these endpoints:
  GET  /search?q=<query>          → search results
  GET  /graph                     → knowledge graph nodes + edges
  POST /ingest                    → upload + index new files
  GET  /status                    → index stats (file count, model, etc.)
"""

import hashlib
import os
import re
import shutil
import tempfile
from datetime import datetime
from typing import Optional

from fastapi import FastAPI, File, HTTPException, Query, UploadFile
from fastapi.middleware.cors import CORSMiddleware

from backend import SemanticMemory

# ── App setup ──────────────────────────────────────────────────────────────

app = FastAPI(title="MemoryGraph API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",   # Vite dev server
        "http://localhost:3000",   # CRA fallback
        "http://127.0.0.1:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Initialise the SemanticMemory engine (once, at startup) ────────────────

ROOT_DIR = os.getenv("SEMANTIC_ROOT_DIR", os.path.join(os.path.dirname(__file__), "test_documents"))

print(f">>> Starting MemoryGraph API — root: {ROOT_DIR}")
memory = SemanticMemory(root_directory=ROOT_DIR)

# ── Supported file extensions for ingest ──────────────────────────────────

SUPPORTED_EXTENSIONS = {".txt", ".md", ".pdf", ".docx", ".py", ".json"}

# ── Edge-type colour map (matches React dashboard) ────────────────────────

EDGE_COLOURS = {
    "VERSION_OF": "#5b7fff",
    "CO_LOCATED": "#2dd4bf",
    "RELATED_TO": "#f59e0b",
}

NODE_SIZE_BASE = 8
NODE_SIZE_SCALE = 6   # added per unit of pagerank (normalised 0-1)


# ── Helpers ────────────────────────────────────────────────────────────────

def _ext(filename: str) -> str:
    """Return lowercase extension without the dot."""
    return os.path.splitext(filename)[1].lower().lstrip(".")


def _short_path(full_path: str) -> str:
    """Return a tilde-collapsed display path."""
    home = os.path.expanduser("~")
    if full_path.startswith(home):
        return "~" + full_path[len(home):]
    return full_path


def _infer_graph_positions(nodes: list[dict]) -> list[dict]:
    """
    Assign (x, y) coordinates for graph rendering when the engine does not
    produce layout positions.  Uses a simple force-free circular layout.
    """
    import math
    total = len(nodes)
    if total == 0:
        return nodes
    cx, cy, radius = 280, 200, 160
    for i, node in enumerate(nodes):
        if "x" not in node or "y" not in node:
            angle = (2 * math.pi * i) / total
            node["x"] = round(cx + radius * math.cos(angle))
            node["y"] = round(cy + radius * math.sin(angle))
    return nodes


def _format_result(doc_id: str, score: float, breakdown: dict, doc: dict, chunk_index: int = 0, total_chunks: int = 1) -> dict:
    """
    Convert a backend result dict into the shape the React frontend expects.

    Frontend shape (from App.jsx):
    {
      id, file, path, ext, snippet,
      scores: { bm25, semantic, graph },
      final,
      tags,
      chunk,
      date
    }
    """
    filename = doc.get("filename", "unknown")
    raw_path = doc.get("path", doc.get("folder", ""))
    display_path = _short_path(os.path.dirname(raw_path)) + "/"

    # Pull per-component scores from breakdown (already computed in hybrid_search)
    bm25_raw = breakdown.get("bm25", 0.0)
    semantic_raw = breakdown.get("semantic", 0.0)
    graph_raw = breakdown.get("graph", 0.0)

    # Normalise component scores to 0-1 for the bar charts
    # (they're already weighted fractions; divide by weights to recover raw)
    bm25_norm = min(1.0, bm25_raw / 0.55) if bm25_raw else 0.0
    semantic_norm = min(1.0, semantic_raw / 0.30) if semantic_raw else 0.0
    graph_norm = min(1.0, graph_raw / 0.10) if graph_raw else 0.0

    # Relationship tags from the graph edges for this document
    tags = []
    if memory.graph.has_node(doc_id):
        seen = set()
        for _, __, attrs in memory.graph.out_edges(doc_id, data=True):
            rel = attrs.get("relation")
            if rel and rel not in seen:
                tags.append(rel)
                seen.add(rel)

    # Date from metadata (already extracted by backend)
    date_str = doc.get("metadata", {}).get("date", doc.get("mod_time", "")[:10])

    return {
        "id": doc_id,
        "file": filename,
        "path": display_path,
        "ext": _ext(filename),
        "snippet": (doc.get("preview") or "")[:300],
        "scores": {
            "bm25": round(bm25_norm, 3),
            "semantic": round(semantic_norm, 3),
            "graph": round(graph_norm, 3),
        },
        "final": min(1.0, round(float(score), 3)),
        "tags": tags,
        "chunk": f"chunk 1/{total_chunks}",
        "date": date_str,
    }


# ── Routes ─────────────────────────────────────────────────────────────────

@app.get("/search")
def search(q: str = Query(..., min_length=1, description="Natural-language search query")):
    """
    Run hybrid BM25 + semantic + graph search and return ranked results.
    Calls the existing SemanticMemory.hybrid_search() method.
    """
    if not memory.documents:
        return {"results": [], "query": q, "count": 0}

    try:
        raw_results = memory.hybrid_search(q)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Search failed: {exc}")

    formatted = []
    for item in raw_results:
        # hybrid_search returns: filename, path, score, breakdown, snippet, mod_time
        # We need the doc_id to look up graph edges — find it by path match.
        doc_id = None
        for did, doc in memory.documents.items():
            if doc.get("filename") == item.get("filename") and doc.get("path") == item.get("path"):
                doc_id = did
                break

        if doc_id is None:
            # Fallback: match by filename only
            for did, doc in memory.documents.items():
                if doc.get("filename") == item.get("filename"):
                    doc_id = did
                    break

        if doc_id is None:
            continue

        doc = memory.documents[doc_id]

        # Count chunks for this document
        total_chunks = sum(1 for c in memory.chunks if c.get("parent_id") == doc_id)
        total_chunks = max(1, total_chunks)

        formatted.append(
            _format_result(
                doc_id=doc_id,
                score=item["score"],
                breakdown=item.get("breakdown", {}),
                doc=doc,
                total_chunks=total_chunks,
            )
        )

    return {
        "results": formatted,
        "query": q,
        "count": len(formatted),
    }


@app.get("/graph")
def graph():
    """
    Return the knowledge graph as nodes + edges for the React graph visualiser.
    Derives positions from a circular layout if not already stored.
    """
    if not memory.graph or memory.graph.number_of_nodes() == 0:
        return {"nodes": [], "edges": []}

    # Normalise pagerank for node sizing
    pr = memory.pagerank_scores or {}
    pr_max = max(pr.values()) if pr else 1.0
    pr_max = pr_max if pr_max > 0 else 1.0

    nodes = []
    for node_id, attrs in memory.graph.nodes(data=True):
        label = attrs.get("label", node_id)
        ext = _ext(label)
        pr_norm = pr.get(node_id, 0.0) / pr_max

        # Colour nodes by file type (matches EXT_COLOURS in App.jsx)
        colour_map = {
            "pdf": "#f87171",
            "md": "#2dd4bf",
            "docx": "#5b7fff",
            "py": "#4ade80",
            "txt": "#a78bfa",
            "json": "#f59e0b",
        }
        colour = colour_map.get(ext, "#9aa0b4")
        size = round(NODE_SIZE_BASE + pr_norm * NODE_SIZE_SCALE)

        nodes.append({
            "id": node_id,
            "label": label,
            "color": colour,
            "size": size,
        })

    nodes = _infer_graph_positions(nodes)

    edges = []
    for source, target, attrs in memory.graph.edges(data=True):
        relation = attrs.get("relation", "RELATED_TO")
        weight = attrs.get("weight", 0.5)
        edges.append({
            "from": source,
            "to": target,
            "type": relation,
            "weight": round(float(weight), 3),
            "color": EDGE_COLOURS.get(relation, "#5c6278"),
        })

    return {"nodes": nodes, "edges": edges}


@app.post("/ingest")
async def ingest(files: list[UploadFile] = File(...)):
    """
    Accept one or more uploaded files, save them into the documents root,
    then re-index so the search index is immediately up to date.
    """
    if not files:
        raise HTTPException(status_code=400, detail="No files provided.")

    saved = []
    skipped = []

    for upload in files:
        filename = upload.filename or "unnamed"
        ext = os.path.splitext(filename)[1].lower()

        if ext not in SUPPORTED_EXTENSIONS:
            skipped.append({"file": filename, "reason": f"Unsupported extension '{ext}'"})
            continue

        dest_path = os.path.join(ROOT_DIR, filename)

        # Avoid overwriting — append a timestamp suffix if the file already exists
        if os.path.exists(dest_path):
            stem, suffix = os.path.splitext(filename)
            timestamp = datetime.utcnow().strftime("%Y%m%d%H%M%S")
            dest_path = os.path.join(ROOT_DIR, f"{stem}_{timestamp}{suffix}")

        try:
            with open(dest_path, "wb") as out:
                shutil.copyfileobj(upload.file, out)
            saved.append({"file": filename, "saved_as": os.path.basename(dest_path)})
        except Exception as exc:
            skipped.append({"file": filename, "reason": str(exc)})
        finally:
            await upload.close()

    # Re-index so the new files are immediately searchable
    if saved:
        try:
            memory.index_files()
        except Exception as exc:
            return {
                "status": "partial",
                "saved": saved,
                "skipped": skipped,
                "warning": f"Files saved but re-index failed: {exc}",
            }

    return {
        "status": "ok",
        "saved": saved,
        "skipped": skipped,
        "total_documents": len(memory.documents),
    }


@app.get("/status")
def status():
    """
    Return basic stats about the current index state.
    Shown in the frontend status bar.
    """
    return {
        "total_documents": len(memory.documents),
        "total_chunks": len(memory.chunks),
        "graph_nodes": memory.graph.number_of_nodes() if memory.graph else 0,
        "graph_edges": memory.graph.number_of_edges() if memory.graph else 0,
        "model": memory.model_name,
        "chunk_size": memory.chunk_size,
        "chunk_overlap": memory.chunk_overlap,
        "reranking_enabled": memory.enable_rerank,
        "llm_intent_enabled": memory.enable_llm_intent,
        "root_directory": ROOT_DIR,
    }


@app.get("/health")
def health():
    """Simple liveness check."""
    return {"status": "ok"}