"""Source routes: upload, paste, list, get, chunks, delete.

The 50 MB per-file cap is enforced *during* streaming (see `_read_capped`),
and a combined cap of 4x the per-file limit bounds the whole request, so a
bulk multi-file payload is rejected file-by-file without unbounded work.
All routes require login; source access is refused outside the owner's notebooks.
"""
from __future__ import annotations

from fastapi import Depends, FastAPI, File, HTTPException, Query, UploadFile

from api.deps import get_current_user, get_store, notebook_or_404, safe_id
from core import ingest, parsers
from core.fetcher import FetchError
from core.ingest import IngestError
from core.models import PasteCreate, Source, SourceUpdate, UrlCreate, User

MAX_FILES = 20
MAX_TOTAL_MULTIPLE = 4  # combined upload cap, as a multiple of the per-file cap


def register(app: FastAPI) -> None:
    @app.post("/api/notebooks/{notebook_id}/sources")
    async def upload_sources(
        notebook_id: str,
        files: list[UploadFile] = File(...),
        user: User = Depends(get_current_user),
    ):
        notebook_id = safe_id(notebook_id, "notebook_id")
        notebook_or_404(get_store(app), user.id, notebook_id)
        if len(files) > MAX_FILES:
            raise HTTPException(status_code=400, detail=f"max {MAX_FILES} files per upload")
        created, errors = [], []
        accepted = 0
        total_cap = MAX_TOTAL_MULTIPLE * parsers.MAX_BYTES
        for f in files:
            try:
                data = await _read_capped(f)
                if accepted + len(data) > total_cap:
                    raise IngestError(
                        "combined upload size exceeds"
                        f" {MAX_TOTAL_MULTIPLE}x the per-file limit",
                        status=413,
                    )
                accepted += len(data)
                source = ingest.ingest_bytes(
                    get_store(app), notebook_id, f.filename, f.content_type, data
                )
                created.append(_summary(source))
            except IngestError as exc:
                errors.append({"file": f.filename, "detail": str(exc)})
        return {"sources": created, "errors": errors}

    @app.post("/api/notebooks/{notebook_id}/sources/text", status_code=201)
    def create_paste_source(
        notebook_id: str, body: PasteCreate, user: User = Depends(get_current_user)
    ):
        notebook_id = safe_id(notebook_id, "notebook_id")
        notebook_or_404(get_store(app), user.id, notebook_id)
        source = ingest.ingest_text(get_store(app), notebook_id, body.title, body.text)
        return _summary(source)

    @app.post("/api/notebooks/{notebook_id}/sources/url", status_code=201)
    def create_url_source(
        notebook_id: str, body: UrlCreate, user: User = Depends(get_current_user)
    ):
        notebook_id = safe_id(notebook_id, "notebook_id")
        notebook_or_404(get_store(app), user.id, notebook_id)
        try:
            source = ingest.ingest_url(get_store(app), notebook_id, body.url)
        except FetchError as exc:
            raise HTTPException(status_code=exc.status, detail=str(exc))
        return _summary(source)

    @app.get("/api/notebooks/{notebook_id}/sources")
    def list_sources(notebook_id: str, user: User = Depends(get_current_user)):
        notebook_id = safe_id(notebook_id, "notebook_id")
        notebook_or_404(get_store(app), user.id, notebook_id)
        return get_store(app).list_sources(notebook_id)

    @app.patch("/api/sources/{source_id}")
    def update_source(
        source_id: str, body: SourceUpdate, user: User = Depends(get_current_user)
    ):
        source_id = safe_id(source_id, "source_id")
        store = get_store(app)
        src = store.find_source_for_user(user.id, source_id)
        if not src:
            raise HTTPException(status_code=404, detail="source not found")
        updated = store.update_source(
            src.notebook_id, source_id, title=body.title, tags=body.tags
        )
        return _summary(updated)

    @app.get("/api/sources/{source_id}")
    def get_source(source_id: str, user: User = Depends(get_current_user)):
        source_id = safe_id(source_id, "source_id")
        source = get_store(app).find_source_for_user(user.id, source_id)
        if not source:
            raise HTTPException(status_code=404, detail="source not found")
        return source

    @app.get("/api/sources/{source_id}/chunks")
    def get_chunks(
        source_id: str,
        offset: int = 0,
        limit: int = Query(default=50, le=200),
        user: User = Depends(get_current_user),
    ):
        source_id = safe_id(source_id, "source_id")
        page = get_store(app).find_source_chunks_for_user(
            user.id, source_id, offset=offset, limit=limit
        )
        if not page:
            raise HTTPException(status_code=404, detail="source not found")
        total, chunks = page
        return {"total": total, "chunks": chunks}

    @app.delete("/api/sources/{source_id}", status_code=204)
    def delete_source(source_id: str, user: User = Depends(get_current_user)):
        source_id = safe_id(source_id, "source_id")
        store = get_store(app)
        source = store.find_source_for_user(user.id, source_id)
        if not source or not get_store(app).delete_source(source.notebook_id, source_id):
            raise HTTPException(status_code=404, detail="source not found")


def _summary(source: Source) -> dict:
    data = source.model_dump(mode="json")
    data.pop("pages")
    data.pop("chunks")
    data["chunk_count"] = len(source.chunks)
    return data


async def _read_capped(f: UploadFile) -> bytes:
    """Read an UploadFile in chunks; raise IngestError(413) once MAX_BYTES is reached."""
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
