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
import json
import os
import re
import shutil
import tempfile
from datetime import datetime
from typing import Optional
import ollama
from fastapi import FastAPI, File, HTTPException, Query, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

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
TEXT_EDITABLE_EXTENSIONS = {".txt", ".md", ".py", ".json"}

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


def _resolve_relative_path(rel_path: str) -> tuple[str, str]:
    """Resolve a user-provided path under ROOT_DIR and block traversal."""
    clean = (rel_path or "").strip().replace("\\", "/")
    clean = clean.lstrip("/")
    normalized = os.path.normpath(clean)

    if normalized in ("", "."):
        raise HTTPException(status_code=400, detail="Path must not be empty.")

    abs_path = os.path.abspath(os.path.join(ROOT_DIR, normalized))
    root_abs = os.path.abspath(ROOT_DIR)

    try:
        common = os.path.commonpath([root_abs, abs_path])
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid path.")

    if common != root_abs:
        raise HTTPException(status_code=400, detail="Path is outside the managed root.")

    rel_norm = os.path.relpath(abs_path, root_abs).replace("\\", "/")
    return abs_path, rel_norm


def _ensure_supported_extension(path: str):
    ext = os.path.splitext(path)[1].lower()
    if ext not in SUPPORTED_EXTENSIONS:
        raise HTTPException(status_code=400, detail=f"Unsupported extension '{ext}'.")


def _reindex_memory():
    try:
        memory.index_files()
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Re-index failed: {exc}")


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

    Node types:
      file   — a document, sized by PageRank, coloured by file extension
      folder — a directory, rendered as a small square, grey

    Edge types returned (all four now supported):
      VERSION_OF, CO_LOCATED, RELATED_TO, PARENT_FOLDER, CONTAINS_FOLDER
    """
    if not memory.graph or memory.graph.number_of_nodes() == 0:
        return {"nodes": [], "edges": []}

    pr     = memory.pagerank_scores or {}
    pr_max = max(pr.values()) if pr else 1.0
    pr_max = pr_max if pr_max > 0 else 1.0

    FILE_COLOUR_MAP = {
        "pdf":  "#f87171",
        "md":   "#2ee8c8",
        "docx": "#4f80ff",
        "py":   "#3ddc84",
        "txt":  "#b57bff",
        "json": "#ffb340",
    }
    DOC_TYPE_COLOUR_MAP = {
        "resume":       "#f87171",
        "invoice":      "#ffb340",
        "meeting_notes":"#2ee8c8",
        "specification":"#b57bff",
        "general":      "#4f80ff",
    }
    FOLDER_COLOUR = "#272b36"

    EDGE_COLOUR_MAP = {
        "VERSION_OF":      "#4f80ff",
        "CO_LOCATED":      "#2ee8c8",
        "RELATED_TO":      "#ffb340",
        "SHARES_ENTITY":   "#f87171",   # coral — concrete named-entity link
        "SAME_TOPIC":      "#b57bff",   # violet — cluster-based cross-folder link
        "FOLDER_SIMILAR":  "#3ddc84",   # green — folder-level semantic link
        "PARENT_FOLDER":   "#343a4a",
        "CONTAINS_FOLDER": "#272b36",
    }

    # ── Build node list ──────────────────────────────────────────────────
    nodes = []
    for node_id, attrs in memory.graph.nodes(data=True):
        node_type = attrs.get("type", "file")

        if node_type == "folder":
            rel_path = attrs.get("rel_path", os.path.basename(str(node_id)))
            nodes.append({
                "id":       node_id,
                "label":    attrs.get("label", os.path.basename(str(node_id))),
                "color":    FOLDER_COLOUR,
                "size":     7,
                "shape":    "square",
                "nodeType": "folder",
                "relPath":  rel_path,
            })
        else:
            label    = attrs.get("label", str(node_id))
            ext      = _ext(label)
            doc_type = attrs.get("doc_type", "general")
            pr_norm  = pr.get(node_id, 0.0) / pr_max
            size     = round(NODE_SIZE_BASE + pr_norm * NODE_SIZE_SCALE)

            colour = (
                DOC_TYPE_COLOUR_MAP.get(doc_type)
                or FILE_COLOUR_MAP.get(ext)
                or "#9aa0b4"
            )

            doc      = memory.documents.get(node_id, {})
            entities = doc.get("entities", {})
            cluster  = getattr(memory, "_topic_clusters", {}).get(node_id)

            node_entry = {
                "id":       node_id,
                "label":    label,
                "color":    colour,
                "size":     size,
                "shape":    "circle",
                "nodeType": "file",
                "ext":      ext,
                "docType":  doc_type,
                "relPath":  attrs.get("rel_path", ""),
            }
            if entities.get("keywords"):
                node_entry["keywords"] = entities["keywords"][:8]
            if entities.get("names"):
                node_entry["topNames"] = entities["names"][:5]
            if cluster is not None:
                node_entry["cluster"] = cluster

            nodes.append(node_entry)

    # ── Hierarchical layout ──────────────────────────────────────────────
    # Folder nodes get positions based on tree depth; file nodes orbit
    # their parent folder.
    import math

    folder_nodes = [n for n in nodes if n["nodeType"] == "folder"]
    file_nodes   = [n for n in nodes if n["nodeType"] == "file"]

    # Sort folders by depth (shallow first)
    def _depth(n):
        return len(n["relPath"].split("/")) if n["relPath"] != "." else 0

    folder_nodes.sort(key=_depth)

    W, H = 560, 420
    cx, cy = W // 2, H // 2

    # Place folders in a vertical tree layout
    folder_pos: dict[str, tuple[int, int]] = {}
    depth_counts: dict[int, int] = {}
    depth_idx:    dict[int, int] = {}

    for fn in folder_nodes:
        d = _depth(fn)
        depth_counts[d] = depth_counts.get(d, 0) + 1
    for d in depth_counts:
        depth_idx[d] = 0

    for fn in folder_nodes:
        d     = _depth(fn)
        count = depth_counts[d]
        idx   = depth_idx[d]
        depth_idx[d] += 1
        x = round(40 + (W - 80) * (idx + 0.5) / count)
        y = round(30 + d * 80)
        folder_pos[fn["id"]] = (x, y)
        fn["x"] = x
        fn["y"] = y

    # Build a map from folder path → folder node id
    folder_id_by_path: dict[str, str] = {}
    for fn in folder_nodes:
        # node_id is "folder:/abs/path"
        abs_path = str(fn["id"]).replace("folder:", "", 1)
        folder_id_by_path[abs_path] = fn["id"]

    # Place file nodes orbiting their parent folder
    # Group files by their parent folder
    # Use string comparison so we're safe after json roundtrip
    folder_pos_str: dict[str, tuple[int, int]] = {
        str(k): v for k, v in folder_pos.items()
    }

    files_per_folder: dict[str, list] = {}
    for fn in file_nodes:
        parent_folder_id = None
        nid = fn["id"]
        for pred in memory.graph.predecessors(nid):
            pred_str = str(pred)
            if pred_str.startswith("folder:"):
                edge_data = memory.graph.get_edge_data(pred, nid, {})
                if edge_data.get("relation") == "PARENT_FOLDER":
                    parent_folder_id = pred_str
                    break
        key = parent_folder_id or "__no_parent__"
        files_per_folder.setdefault(key, []).append(fn)

    for parent_id_str, flist in files_per_folder.items():
        if parent_id_str in folder_pos_str:
            px, py = folder_pos_str[parent_id_str]
        else:
            px, py = cx, cy

        n      = len(flist)
        radius = max(50, 22 * n)
        for k, fn in enumerate(flist):
            angle  = (2 * math.pi * k / n) - math.pi / 2
            fn["x"] = round(min(W - 20, max(20, px + radius * math.cos(angle))))
            fn["y"] = round(min(H - 20, max(20, py + radius * math.sin(angle))))

    # Merge back
    node_list = folder_nodes + file_nodes

    # ── Build edge list ──────────────────────────────────────────────────
    edges = []
    for source, target, attrs in memory.graph.edges(data=True):
        relation = attrs.get("relation", "RELATED_TO")
        weight   = attrs.get("weight", 0.5)

        # Structural folder edges are thin and de-emphasised
        if relation in ("PARENT_FOLDER", "CONTAINS_FOLDER"):
            w = 0.3
        elif relation == "VERSION_OF":
            w = 1.0
        elif relation in ("SHARES_ENTITY", "SAME_TOPIC"):
            w = 0.8
        elif relation == "FOLDER_SIMILAR":
            w = 0.6
        elif relation == "CO_LOCATED":
            w = 0.7
        else:
            w = round(float(weight), 3)

        edge_payload = {
            "from":   source,
            "to":     target,
            "type":   relation,
            "weight": w,
            "color":  EDGE_COLOUR_MAP.get(relation, "#5c6278"),
        }

        # Attach semantic metadata for richer frontend tooltip
        if relation == "SHARES_ENTITY" and attrs.get("shared"):
            edge_payload["shared"] = attrs["shared"]
        if relation == "SAME_TOPIC" and attrs.get("cluster") is not None:
            edge_payload["cluster"] = attrs["cluster"]
        if relation == "FOLDER_SIMILAR":
            edge_payload["similarity"] = round(float(weight), 3)

        edges.append(edge_payload)

    return {"nodes": node_list, "edges": edges}


@app.get("/debug/graph")
def debug_graph():
    """
    Returns a plain-text tree of how the graph sees your folder structure.
    Hit http://localhost:8000/debug/graph in a browser to verify subfolders
    are being detected correctly before checking the frontend visualisation.
    """
    if not memory.graph or memory.graph.number_of_nodes() == 0:
        return {"error": "Graph not built yet."}

    folder_nodes = [
        (nid, d) for nid, d in memory.graph.nodes(data=True)
        if d.get("type") == "folder"
    ]
    file_nodes = [
        (nid, d) for nid, d in memory.graph.nodes(data=True)
        if d.get("type") == "file"
    ]

    tree: dict[str, list[str]] = {}
    for nid, d in folder_nodes:
        rel = d.get("rel_path", str(nid))
        files_here = []
        for fid, fd in file_nodes:
            if fd.get("folder") == d.get("abs_path"):
                files_here.append(fd.get("label", fid))
        tree[rel] = sorted(files_here)

    return {
        "root": memory.root_directory,
        "folder_count": len(folder_nodes),
        "file_count": len(file_nodes),
        "edge_count": memory.graph.number_of_edges(),
        "edge_types": dict(
            sorted(
                {
                    attrs.get("relation", "?"): 0
                    for _, __, attrs in memory.graph.edges(data=True)
                }.items()
            )
        ),
        "edges_by_type": {
            rel: sum(
                1 for _, __, a in memory.graph.edges(data=True)
                if a.get("relation") == rel
            )
            for rel in ["VERSION_OF", "CO_LOCATED", "RELATED_TO", "PARENT_FOLDER", "CONTAINS_FOLDER"]
        },
        "folder_tree": tree,
    }


@app.get("/files")
def list_files():
    """List all supported files under ROOT_DIR for file-management UI."""
    items = []
    for path in sorted(memory._iter_supported_files()):
        try:
            stat = os.stat(path)
        except FileNotFoundError:
            continue

        rel = os.path.relpath(path, ROOT_DIR).replace("\\", "/")
        ext = os.path.splitext(path)[1].lower()
        items.append({
            "name": os.path.basename(path),
            "path": rel,
            "ext": ext.lstrip("."),
            "size": stat.st_size,
            "modified": datetime.fromtimestamp(stat.st_mtime).isoformat(),
            "editable": ext in TEXT_EDITABLE_EXTENSIONS,
        })

    return {
        "root_directory": ROOT_DIR,
        "count": len(items),
        "files": items,
    }


class SimilarityRequest(BaseModel):
    paths: list[str]


@app.post("/similarity")
def similarity(payload: SimilarityRequest):
    """
    Compare semantic similarity across 2+ files using context-aware vectors.
    Returns pairwise scores + explanations + similarity matrix.
    """
    raw_paths = payload.paths or []
    normalized_paths = [str(path).strip() for path in raw_paths if str(path).strip()]
    normalized_paths = list(dict.fromkeys(normalized_paths))

    if len(normalized_paths) < 2:
        raise HTTPException(status_code=400, detail="Select at least 2 files.")

    doc_id_by_abs: dict[str, str] = {}
    for doc_id, doc in memory.documents.items():
        abs_path = os.path.normcase(os.path.normpath(doc.get("path", "")))
        if abs_path:
            doc_id_by_abs[abs_path] = doc_id

    resolved_doc_ids = []
    resolved_paths = []
    missing_paths = []

    for rel_path in normalized_paths:
        try:
            abs_path, rel_norm = _resolve_relative_path(rel_path)
        except HTTPException:
            missing_paths.append(rel_path)
            continue

        doc_id = doc_id_by_abs.get(os.path.normcase(os.path.normpath(abs_path)))
        if not doc_id:
            missing_paths.append(rel_path)
            continue

        resolved_doc_ids.append(doc_id)
        resolved_paths.append(rel_norm)

    resolved_doc_ids = list(dict.fromkeys(resolved_doc_ids))
    if len(resolved_doc_ids) < 2:
        raise HTTPException(status_code=400, detail="At least 2 valid indexed files are required.")

    comparison = memory.compare_documents(resolved_doc_ids)
    file_meta = {item["doc_id"]: item for item in comparison.get("files", [])}

    files_payload = []
    for doc_id in resolved_doc_ids:
        doc = memory.documents.get(doc_id, {})
        abs_path = doc.get("path", "")
        rel_path = os.path.relpath(abs_path, ROOT_DIR).replace("\\", "/") if abs_path else ""
        files_payload.append(
            {
                "doc_id": doc_id,
                "filename": doc.get("filename", "unknown"),
                "path": rel_path,
                "ext": _ext(doc.get("filename", "")),
                "metadata": doc.get("metadata", {}),
            }
        )

    pairs_payload = []
    for pair in comparison.get("pairs", []):
        doc_a = pair.get("doc_a")
        doc_b = pair.get("doc_b")
        a_meta = file_meta.get(doc_a, {})
        b_meta = file_meta.get(doc_b, {})
        a_abs = a_meta.get("path", "")
        b_abs = b_meta.get("path", "")
        pairs_payload.append(
            {
                "doc_a": doc_a,
                "doc_b": doc_b,
                "file_a": {
                    "filename": a_meta.get("filename", memory.documents.get(doc_a, {}).get("filename", "unknown")),
                    "path": os.path.relpath(a_abs, ROOT_DIR).replace("\\", "/") if a_abs else "",
                },
                "file_b": {
                    "filename": b_meta.get("filename", memory.documents.get(doc_b, {}).get("filename", "unknown")),
                    "path": os.path.relpath(b_abs, ROOT_DIR).replace("\\", "/") if b_abs else "",
                },
                "score": pair.get("score", 0.0),
                "label": pair.get("label", ""),
                "metrics": pair.get("metrics", {}),
                "shared_keywords": pair.get("shared_keywords", []),
                "shared_entities": pair.get("shared_entities", []),
                "explanation": pair.get("explanation", ""),
            }
        )

    matrix_payload = []
    matrix_rows = comparison.get("matrix", [])
    for row in matrix_rows:
        row_doc_id = row.get("doc_id")
        row_doc = memory.documents.get(row_doc_id, {})
        row_abs = row_doc.get("path", "")
        matrix_payload.append(
            {
                "doc_id": row_doc_id,
                "filename": row_doc.get("filename", "unknown"),
                "path": os.path.relpath(row_abs, ROOT_DIR).replace("\\", "/") if row_abs else "",
                "values": row.get("values", []),
            }
        )

    return {
        "count": len(files_payload),
        "files": files_payload,
        "pairs": pairs_payload,
        "matrix": matrix_payload,
        "missing": missing_paths,
    }


@app.get("/files/content")
def get_file_content(path: str = Query(..., min_length=1)):
    """Return UTF-8 text content for editable file types."""
    abs_path, rel_path = _resolve_relative_path(path)
    if not os.path.exists(abs_path) or not os.path.isfile(abs_path):
        raise HTTPException(status_code=404, detail="File not found.")

    ext = os.path.splitext(abs_path)[1].lower()
    if ext not in TEXT_EDITABLE_EXTENSIONS:
        raise HTTPException(status_code=400, detail="This file type is not editable in-app.")

    try:
        with open(abs_path, "r", encoding="utf-8", errors="ignore") as file:
            content = file.read()
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to read file: {exc}")

    return {
        "path": rel_path,
        "content": content,
        "length": len(content),
    }


@app.post("/files")
def create_file(payload: dict):
    """Create a new text file under ROOT_DIR and re-index the corpus."""
    raw_path = str(payload.get("path", "")).strip().strip('"').strip("'")
    content = payload.get("content", "")
    if content is None:
        content = ""

    if raw_path.endswith("/") or raw_path.endswith("\\"):
        raise HTTPException(status_code=400, detail="Path must include a filename, not just a folder.")

    # Be user-friendly: if no extension is provided, default to .txt
    base_name = os.path.basename(raw_path.replace("\\", "/"))
    if base_name and "." not in base_name:
        raw_path = f"{raw_path}.txt"

    abs_path, rel_path = _resolve_relative_path(raw_path)

    ext = os.path.splitext(abs_path)[1].lower()
    if ext not in TEXT_EDITABLE_EXTENSIONS:
        raise HTTPException(status_code=400, detail=f"Only text-like files can be created in-app ({', '.join(sorted(TEXT_EDITABLE_EXTENSIONS))}).")

    _ensure_supported_extension(abs_path)

    if os.path.exists(abs_path):
        raise HTTPException(status_code=409, detail="File already exists.")

    try:
        os.makedirs(os.path.dirname(abs_path), exist_ok=True)
        with open(abs_path, "w", encoding="utf-8") as file:
            file.write(str(content))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to create file: {exc}")

    _reindex_memory()
    return {"status": "ok", "path": rel_path}


@app.put("/files/content")
def update_file_content(payload: dict):
    """Overwrite file content for editable file types and re-index."""
    raw_path = str(payload.get("path", ""))
    if not raw_path:
        raise HTTPException(status_code=400, detail="Path is required.")

    content = payload.get("content", "")
    if content is None:
        content = ""

    abs_path, rel_path = _resolve_relative_path(raw_path)
    if not os.path.exists(abs_path) or not os.path.isfile(abs_path):
        raise HTTPException(status_code=404, detail="File not found.")

    ext = os.path.splitext(abs_path)[1].lower()
    if ext not in TEXT_EDITABLE_EXTENSIONS:
        raise HTTPException(status_code=400, detail="This file type is not editable in-app.")

    try:
        with open(abs_path, "w", encoding="utf-8") as file:
            file.write(str(content))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to save file: {exc}")

    _reindex_memory()
    return {"status": "ok", "path": rel_path}


@app.delete("/files")
def delete_file(path: str = Query(..., min_length=1)):
    """Delete a managed file and re-index."""
    abs_path, rel_path = _resolve_relative_path(path)
    if not os.path.exists(abs_path) or not os.path.isfile(abs_path):
        raise HTTPException(status_code=404, detail="File not found.")

    try:
        os.remove(abs_path)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to delete file: {exc}")

    _reindex_memory()
    return {"status": "ok", "path": rel_path}



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


@app.post("/reindex")
def reindex():
    """Force a full re-index of files under ROOT_DIR."""
    _reindex_memory()
    return {
        "status": "ok",
        "total_documents": len(memory.documents),
        "total_chunks": len(memory.chunks),
        "graph_nodes": memory.graph.number_of_nodes() if memory.graph else 0,
        "graph_edges": memory.graph.number_of_edges() if memory.graph else 0,
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

"""
Changes vs previous version
────────────────────────────
1. scope="file" now queries ONLY the primary file by default.
   Graph expansion (VERSION_OF neighbours only) happens as a fallback
   when the primary file returns no usable chunks — not unconditionally.
2. source objects now carry an `is_primary` flag so the frontend can
   visually distinguish "answered from this file" vs "answered from a
   related version".
3. Confidence is computed only over primary-file chunks when available,
   so a thin primary + rich neighbour doesn't inflate the score.
"""

class QARequest(BaseModel):
    question: str
    scope: str = "all"        # "file" | "all"
    file_id: Optional[str] = None
    filename: Optional[str] = None


def _qa_retrieve(question: str, target_ids: set, top_k: int = 20) -> list[dict]:
    """
    Run hybrid retrieval restricted to `target_ids` and return up to
    `top_k` chunks sorted by descending score, each dict carrying a
    'score' key alongside the original chunk fields.
    """
    import numpy as _np

    query_embedding = memory.encoder.encode(question, normalize_embeddings=True)
    sem_scores  = memory._semantic_scores(query_embedding, top_k=50)
    bm25_scores = memory._bm25_scores(question)

    W_SEM, W_BM25, W_GRAPH = 0.55, 0.25, 0.10

    chunk_scores: dict[str, float] = {}
    for chunk in memory.chunks:
        cid = chunk["chunk_id"]
        pid = chunk["parent_id"]
        if pid not in target_ids:
            continue
        s = (sem_scores.get(pid,  0.0) * W_SEM
           + bm25_scores.get(pid, 0.0) * W_BM25
           + memory.pagerank_scores.get(pid, 0.0) * W_GRAPH)
        chunk_scores[cid] = s

    chunk_map = {c["chunk_id"]: c for c in memory.chunks}
    ranked_ids = sorted(chunk_scores, key=chunk_scores.get, reverse=True)[:top_k]
    return [
        {**chunk_map[cid], "score": chunk_scores[cid]}
        for cid in ranked_ids
        if cid in chunk_map
    ]


def _qa_rerank(question: str, chunks: list[dict]) -> list[dict]:
    """Apply cross-encoder reranking if the reranker is loaded."""
    reranker = memory._load_reranker()
    if not reranker or not chunks:
        return chunks
    pairs = [(question, c["text"]) for c in chunks]
    rr_scores = reranker.predict(pairs)
    return [c for _, c in sorted(zip(rr_scores, chunks), key=lambda x: x[0], reverse=True)]


@app.post("/qa")
def qa_endpoint(req: QARequest):
    """
    File-specific or global QA using hybrid retrieval + phi3:mini.

    Scoping rules
    ─────────────
    scope="file" + file_id  →  query primary file only.
                                If that yields no usable chunks, fall back
                                to VERSION_OF neighbours (same document
                                lineage), but mark those sources clearly.
                                RELATED_TO neighbours are never auto-included
                                in single-file scope — they are unrelated docs.

    scope="all"             →  query all indexed documents.
    """
    if not memory.documents:
        return {"answer": "No documents indexed yet.", "sources": [], "confidence": 0.0}

    question = req.question.strip()
    if not question:
        raise HTTPException(status_code=400, detail="Question must not be empty.")

    # ── Step 1: determine primary and (optional) fallback target sets ─────────
    is_file_scope = req.scope == "file" and bool(req.file_id)

    if is_file_scope:
        primary_ids  = {req.file_id}
        # VERSION_OF neighbours only — same document lineage
        version_ids: set[str] = set()
        if memory.graph.has_node(req.file_id):
            for src, tgt, attrs in memory.graph.out_edges(req.file_id, data=True):
                if attrs.get("relation") == "VERSION_OF":
                    version_ids.add(tgt)
            for src, tgt, attrs in memory.graph.in_edges(req.file_id, data=True):
                if attrs.get("relation") == "VERSION_OF":
                    version_ids.add(src)
    else:
        primary_ids = set(memory.documents.keys())
        version_ids = set()

    # ── Step 2: retrieve from primary file ────────────────────────────────────
    MIN_USEFUL_SCORE = 0.05   # chunks below this are noise
    MIN_CHUNKS_NEEDED = 2     # if fewer than this pass the threshold, try fallback

    primary_chunks = _qa_retrieve(question, primary_ids, top_k=20)
    primary_chunks = _qa_rerank(question, primary_chunks)
    useful_primary  = [c for c in primary_chunks if c["score"] >= MIN_USEFUL_SCORE]

    used_fallback = False

    if is_file_scope and len(useful_primary) < MIN_CHUNKS_NEEDED and version_ids:
        # Not enough signal in the primary file — try version siblings
        fallback_chunks = _qa_retrieve(question, version_ids, top_k=10)
        fallback_chunks = _qa_rerank(question, fallback_chunks)
        useful_fallback = [c for c in fallback_chunks if c["score"] >= MIN_USEFUL_SCORE]
        if useful_fallback:
            useful_primary = useful_primary + useful_fallback
            used_fallback  = True

    # Dynamic K: fewer chunks when confidence is high
    avg_score = (sum(c["score"] for c in useful_primary[:5]) /
                 max(len(useful_primary[:5]), 1))
    K = 4 if avg_score > 0.6 else 7
    final_chunks = useful_primary[:K]

    if not final_chunks:
        return {
            "answer": "Not found in provided files.",
            "sources": [],
            "confidence": 0.0,
            "scoped_to": req.filename or "all files",
        }

    # ── Step 3: build context ─────────────────────────────────────────────────
    context_parts: list[str] = []
    for chunk in final_chunks:
        pid  = chunk["parent_id"]
        doc  = memory.documents.get(pid, {})
        fname = doc.get("filename", "unknown")
        context_parts.append(f"[{fname}]\n{chunk['text']}")

    context = "\n\n---\n\n".join(context_parts)
    if len(context) > 14_000:
        context = context[:14_000] + "\n...[truncated]"

    # ── Step 4: strict prompt → Ollama ───────────────────────────────────────
    scope_note = (
        f"You are answering a question about the file '{req.filename}'."
        if is_file_scope and req.filename
        else "You are answering a question about the user's personal document collection."
    )

    prompt = f"""{scope_note}
Answer using ONLY the context below. Do not use any outside knowledge.

Context:
{context}

Question:
{question}

Instructions:
- Answer directly and concisely.
- Base your answer ONLY on the context provided.
- If the answer is not in the context, respond exactly: "Not found in provided files."
- Do not repeat the question or mention these instructions.

Answer:"""

    try:
        response = ollama.chat(
            model="phi3:mini",
            messages=[{"role": "user", "content": prompt}],
        )
        answer = response["message"]["content"].strip()
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"LLM unavailable: {exc}")

    # ── Step 5: confidence + sources ─────────────────────────────────────────
    # Compute confidence from primary-file chunks only (don't let fallback inflate it)
    primary_final = [c for c in final_chunks if c["parent_id"] in primary_ids]
    score_pool    = primary_final if primary_final else final_chunks
    raw_conf      = sum(c["score"] for c in score_pool) / max(len(score_pool), 1)
    confidence    = round(min(max(raw_conf, 0.0), 1.0), 3)

    # Build deduplicated source list; mark whether each is the primary file
    sources: list[dict] = []
    seen_files: set[str] = set()
    for chunk in final_chunks:
        pid   = chunk["parent_id"]
        doc   = memory.documents.get(pid, {})
        fname = doc.get("filename", "unknown")
        if fname not in seen_files:
            seen_files.add(fname)
            sources.append({
                "file":       fname,
                "path":       _short_path(doc.get("path", "")),
                "chunk":      chunk["text"][:120] + "…",
                "is_primary": pid in primary_ids,  # ← NEW: frontend uses this
            })

    return {
        "answer":     answer,
        "sources":    sources,
        "confidence": confidence,
        "scoped_to":  req.filename or "all files",
        "used_fallback": used_fallback,  # ← frontend can show a notice
    }