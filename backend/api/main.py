from __future__ import annotations

import logging
import re
from contextlib import asynccontextmanager

from fastapi import FastAPI, File, HTTPException, Path, Query, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from core import ingest, parsers
from core.ingest import IngestError
from core.models import NotebookCreate, PasteCreate, Source
from core.store import Store

logger = logging.getLogger("api")
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")

MAX_FILES = 20

# IDs are produced by core.store.new_id() as 12 lowercase hex chars. Anything else
# is rejected at the route boundary to prevent path traversal in the JSON store.
_ID = re.compile(r"^[a-f0-9]{12}$")


def safe_id(value: str, name: str) -> str:
    if not _ID.match(value):
        raise HTTPException(status_code=400, detail=f"invalid {name}")
    return value


@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.store = Store()
    yield


app = FastAPI(title="research", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(Exception)
async def _unhandled(request: Request, exc: Exception) -> JSONResponse:
    logger.exception("unhandled exception on %s %s", request.method, request.url.path)
    return JSONResponse(status_code=500, content={"detail": "internal server error"})


@app.get("/api/health")
def health():
    return {"ok": True}


def _store() -> Store:
    return app.state.store


def _notebook_or_404(notebook_id: str):
    nb = _store().get_notebook(notebook_id)
    if not nb:
        raise HTTPException(status_code=404, detail="notebook not found")
    return nb


def _summary(source: Source) -> dict:
    data = source.model_dump(mode="json")
    data.pop("pages")
    data.pop("chunks")
    data["chunk_count"] = len(source.chunks)
    return data


async def _read_capped(f: UploadFile) -> bytes:
    """Read an UploadFile in chunks; raise IngestError(413) once MAX_BYTES is reached.

    Streaming lets us reject a multi-GB payload without buffering the full body.
    """
    cap = parsers.MAX_BYTES
    chunk_size = 1024 * 1024  # 1 MB
    buf = bytearray()
    while True:
        chunk = await f.read(chunk_size)
        if not chunk:
            break
        buf.extend(chunk)
        if len(buf) > cap:
            raise IngestError("file exceeds 50 MB limit", status=413)
    return bytes(buf)


@app.post("/api/notebooks", status_code=201)
def create_notebook(body: NotebookCreate):
    return _store().create_notebook(body.name)


@app.get("/api/notebooks")
def list_notebooks():
    return _store().list_notebooks()


@app.delete("/api/notebooks/{notebook_id}", status_code=204)
def delete_notebook(notebook_id: str = Path(...)):
    notebook_id = safe_id(notebook_id, "notebook_id")
    if not _store().delete_notebook(notebook_id):
        raise HTTPException(status_code=404, detail="notebook not found")


@app.post("/api/notebooks/{notebook_id}/sources")
async def upload_sources(notebook_id: str = Path(...), files: list[UploadFile] = File(...)):
    notebook_id = safe_id(notebook_id, "notebook_id")
    _notebook_or_404(notebook_id)
    if len(files) > MAX_FILES:
        raise HTTPException(status_code=400, detail=f"max {MAX_FILES} files per upload")
    sources, errors = [], []
    for f in files:
        try:
            data = await _read_capped(f)
            source = ingest.ingest_bytes(
                _store(), notebook_id, f.filename, f.content_type, data
            )
            sources.append(_summary(source))
        except IngestError as exc:
            errors.append({"file": f.filename, "detail": str(exc)})
    return {"sources": sources, "errors": errors}


@app.post("/api/notebooks/{notebook_id}/sources/text", status_code=201)
def create_paste_source(notebook_id: str = Path(...), body: PasteCreate = ...):
    notebook_id = safe_id(notebook_id, "notebook_id")
    _notebook_or_404(notebook_id)
    source = ingest.ingest_text(_store(), notebook_id, body.title, body.text)
    return _summary(source)


@app.get("/api/notebooks/{notebook_id}/sources")
def list_sources(notebook_id: str = Path(...)):
    notebook_id = safe_id(notebook_id, "notebook_id")
    _notebook_or_404(notebook_id)
    return _store().list_sources(notebook_id)


@app.get("/api/notebooks/{notebook_id}/search")
def search_notebook(notebook_id: str = Path(...), q: str = Query(min_length=1, max_length=500)):
    notebook_id = safe_id(notebook_id, "notebook_id")
    _notebook_or_404(notebook_id)
    return _store().search(notebook_id, q)


@app.get("/api/sources/{source_id}")
def get_source(source_id: str = Path(...)):
    source_id = safe_id(source_id, "source_id")
    source = _store().find_source(source_id)
    if not source:
        raise HTTPException(status_code=404, detail="source not found")
    return source


@app.get("/api/sources/{source_id}/chunks")
def get_chunks(source_id: str = Path(...), offset: int = 0, limit: int = Query(default=50, le=200)):
    source_id = safe_id(source_id, "source_id")
    source = _store().find_source(source_id)
    if not source:
        raise HTTPException(status_code=404, detail="source not found")
    return {
        "total": len(source.chunks),
        "chunks": source.chunks[offset : offset + limit],
    }


@app.delete("/api/sources/{source_id}", status_code=204)
def delete_source(source_id: str = Path(...)):
    source_id = safe_id(source_id, "source_id")
    source = _store().find_source(source_id)
    if not source or not _store().delete_source(source.notebook_id, source_id):
        raise HTTPException(status_code=404, detail="source not found")

