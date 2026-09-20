"""Notebook Markdown note CRUD with optimistic concurrency and source citations."""
from __future__ import annotations

from fastapi import Depends, FastAPI, HTTPException

from api.deps import get_current_user, get_store, notebook_or_404, safe_id
from core.models import Note, NoteCitation, NoteCreate, NoteSummary, NoteUpdate, User, utcnow
from core.store import new_id


def _clean_tags(tags: list[str]) -> list[str]:
    seen: set[str] = set()
    cleaned: list[str] = []
    for tag in tags:
        value = " ".join(tag.split()).lower()
        if value and value not in seen:
            seen.add(value)
            cleaned.append(value)
    return cleaned


def _validate_citations(store, notebook_id: str, citations: list[NoteCitation]) -> None:
    for citation in citations:
        source = store.get_source(notebook_id, citation.source_id)
        if source is None:
            raise HTTPException(status_code=400, detail="citation source not found in notebook")
        if citation.chunk_seq >= len(source.chunks):
            raise HTTPException(status_code=400, detail="citation chunk is out of range")


def register(app: FastAPI) -> None:
    @app.post("/api/notebooks/{notebook_id}/notes", response_model=Note, status_code=201)
    def create_note(notebook_id: str, body: NoteCreate, user: User = Depends(get_current_user)):
        notebook_id = safe_id(notebook_id, "notebook_id")
        store = get_store(app)
        notebook_or_404(store, user.id, notebook_id)
        citations = list(body.citations)
        _validate_citations(store, notebook_id, citations)
        now = utcnow()
        return store.create_note(
            Note(
                id=new_id(),
                notebook_id=notebook_id,
                title=body.title.strip(),
                body=body.body,
                tags=_clean_tags(body.tags),
                citations=citations,
                rev=1,
                created_at=now,
                updated_at=now,
            )
        )

    @app.get("/api/notebooks/{notebook_id}/notes", response_model=list[NoteSummary])
    def list_notes(notebook_id: str, user: User = Depends(get_current_user)):
        notebook_id = safe_id(notebook_id, "notebook_id")
        store = get_store(app)
        notebook_or_404(store, user.id, notebook_id)
        return store.list_notes(notebook_id)

    @app.get("/api/notebooks/{notebook_id}/notes/{note_id}", response_model=Note)
    def get_note(notebook_id: str, note_id: str, user: User = Depends(get_current_user)):
        notebook_id = safe_id(notebook_id, "notebook_id")
        note_id = safe_id(note_id, "note_id")
        store = get_store(app)
        notebook_or_404(store, user.id, notebook_id)
        note = store.get_note(notebook_id, note_id)
        if note is None:
            raise HTTPException(status_code=404, detail="note not found")
        return note

    @app.patch("/api/notebooks/{notebook_id}/notes/{note_id}", response_model=Note)
    def update_note(notebook_id: str, note_id: str, body: NoteUpdate, user: User = Depends(get_current_user)):
        notebook_id = safe_id(notebook_id, "notebook_id")
        note_id = safe_id(note_id, "note_id")
        store = get_store(app)
        notebook_or_404(store, user.id, notebook_id)
        current = store.get_note(notebook_id, note_id)
        if current is None:
            raise HTTPException(status_code=404, detail="note not found")
        citations = current.citations if body.citations is None else list(body.citations)
        if body.citations is not None:
            _validate_citations(store, notebook_id, citations)
        title = current.title if body.title is None else body.title.strip()
        if not title:
            raise HTTPException(status_code=422, detail="title must not be blank")
        updated = store.update_note(
            notebook_id,
            note_id,
            body.base_rev,
            title=title,
            body=current.body if body.body is None else body.body,
            tags=current.tags if body.tags is None else _clean_tags(body.tags),
            citations=citations,
            updated_at=utcnow(),
        )
        if updated is None:
            latest = store.get_note(notebook_id, note_id)
            if latest is None:
                raise HTTPException(status_code=404, detail="note not found")
            raise HTTPException(status_code=409, detail={"message": "note revision conflict", "current": latest.model_dump(mode="json")})
        return updated

    @app.delete("/api/notebooks/{notebook_id}/notes/{note_id}", status_code=204)
    def delete_note(notebook_id: str, note_id: str, user: User = Depends(get_current_user)):
        notebook_id = safe_id(notebook_id, "notebook_id")
        note_id = safe_id(note_id, "note_id")
        store = get_store(app)
        notebook_or_404(store, user.id, notebook_id)
        if not store.delete_note(notebook_id, note_id):
            raise HTTPException(status_code=404, detail="note not found")
