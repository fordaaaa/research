"""Keyless study tools: manual flashcards with Anki-ready export.

Cards are plain local JSON. Practice state (known/unknown, order) lives in the
frontend session — the backend only stores the deck.
"""
from __future__ import annotations

from fastapi import FastAPI, HTTPException
from fastapi.responses import PlainTextResponse

from api.deps import get_store, notebook_or_404, safe_id
from api.sources import _summary
from core import ingest, study as study_core
from core.models import CardCreate, CardUpdate, Flashcard, utcnow
from core.store import Store, new_id


def _clean_tags(tags: list[str]) -> list[str]:
    seen: set[str] = set()
    out: list[str] = []
    for tag in tags:
        clean = " ".join(tag.split()).lower()[:40]
        if clean and clean not in seen:
            seen.add(clean)
            out.append(clean)
    return out


def _get_card(store, notebook_id: str, card_id: str) -> Flashcard:
    card_id = safe_id(card_id, "card_id")
    card = store.get_card(notebook_id, card_id)
    if card is None:
        raise HTTPException(status_code=404, detail="card not found")
    return card


def _study_sources(store: Store, notebook_id: str) -> list:
    summaries = store.list_sources(notebook_id)
    sources = []
    for summary in summaries:
        source = store.get_source(notebook_id, summary.id)
        if source:
            sources.append(source)
    if not sources:
        raise HTTPException(status_code=400, detail="add a source before studying")
    return sources


def register(app: FastAPI) -> None:
    @app.get("/api/notebooks/{notebook_id}/cards", response_model=list[Flashcard])
    def list_cards(notebook_id: str):
        notebook_id = safe_id(notebook_id, "notebook_id")
        store = get_store(app)
        notebook_or_404(store, notebook_id)
        return store.list_cards(notebook_id)

    @app.post("/api/notebooks/{notebook_id}/cards", response_model=Flashcard, status_code=201)
    def create_card(notebook_id: str, body: CardCreate):
        notebook_id = safe_id(notebook_id, "notebook_id")
        store = get_store(app)
        notebook_or_404(store, notebook_id)
        now = utcnow()
        card = Flashcard(
            id=new_id(),
            notebook_id=notebook_id,
            front=" ".join(body.front.split()),
            back=body.back.strip(),
            tags=_clean_tags(body.tags),
            created_at=now,
            updated_at=now,
        )
        return store.save_card(card)

    @app.patch("/api/notebooks/{notebook_id}/cards/{card_id}", response_model=Flashcard)
    def update_card(notebook_id: str, card_id: str, body: CardUpdate):
        notebook_id = safe_id(notebook_id, "notebook_id")
        store = get_store(app)
        notebook_or_404(store, notebook_id)
        card = _get_card(store, notebook_id, card_id)
        if body.front is not None:
            card.front = " ".join(body.front.split())
        if body.back is not None:
            card.back = body.back.strip()
        if body.tags is not None:
            card.tags = _clean_tags(body.tags)
        card.updated_at = utcnow()
        return store.save_card(card)

    @app.delete("/api/notebooks/{notebook_id}/cards/{card_id}", status_code=204)
    def delete_card(notebook_id: str, card_id: str):
        notebook_id = safe_id(notebook_id, "notebook_id")
        store = get_store(app)
        notebook_or_404(store, notebook_id)
        card_id = safe_id(card_id, "card_id")
        if not store.delete_card(notebook_id, card_id):
            raise HTTPException(status_code=404, detail="card not found")

    @app.get("/api/notebooks/{notebook_id}/cards/export")
    def export_cards(notebook_id: str):
        notebook_id = safe_id(notebook_id, "notebook_id")
        store = get_store(app)
        notebook = notebook_or_404(store, notebook_id)
        lines = ["Front\tBack\tTags"]
        for card in store.list_cards(notebook_id):
            front = card.front.replace("\t", " ").replace("\n", " ")
            back = card.back.replace("\t", " ").replace("\n", "<br>")
            lines.append(f"{front}\t{back}\t{' '.join(card.tags)}")
        filename = "".join(c if c.isalnum() else "-" for c in notebook.name).strip("-") or "deck"
        return PlainTextResponse(
            "\n".join(lines) + "\n",
            media_type="text/tab-separated-values",
            headers={"Content-Disposition": f'attachment; filename="{filename}-flashcards.tsv"'},
        )

    @app.get("/api/notebooks/{notebook_id}/guide")
    def get_guide(notebook_id: str):
        """Build a one-page study guide from the notebook's own sources."""
        notebook_id = safe_id(notebook_id, "notebook_id")
        store = get_store(app)
        notebook = notebook_or_404(store, notebook_id)
        return {"markdown": study_core.build_study_guide(notebook.name, _study_sources(store, notebook_id))}

    @app.post("/api/notebooks/{notebook_id}/guide", status_code=201)
    def save_guide(notebook_id: str):
        """Save the study guide as a notebook source so it exports with everything."""
        notebook_id = safe_id(notebook_id, "notebook_id")
        store = get_store(app)
        notebook = notebook_or_404(store, notebook_id)
        sources = _study_sources(store, notebook_id)
        markdown = study_core.build_study_guide(notebook.name, sources)
        source = ingest.ingest_text(
            store, notebook_id, f"Study guide: {notebook.name}", markdown,
            extra_meta={"study_guide": True, "origin": "keyless"},
        )
        return {"source": _summary(source)}

    @app.get("/api/notebooks/{notebook_id}/mindmap")
    def get_mindmap(notebook_id: str):
        """Notebook → sources → key-terms tree for the map UI."""
        notebook_id = safe_id(notebook_id, "notebook_id")
        store = get_store(app)
        notebook = notebook_or_404(store, notebook_id)
        return study_core.build_mindmap(notebook.name, _study_sources(store, notebook_id))

    @app.get("/api/notebooks/{notebook_id}/mindmap/export")
    def export_mindmap(notebook_id: str):
        """Download the mind map as a markdown outline."""
        notebook_id = safe_id(notebook_id, "notebook_id")
        store = get_store(app)
        notebook = notebook_or_404(store, notebook_id)
        tree = study_core.build_mindmap(notebook.name, _study_sources(store, notebook_id))
        filename = "".join(c if c.isalnum() else "-" for c in notebook.name).strip("-") or "mindmap"
        return PlainTextResponse(
            study_core.mindmap_markdown(tree),
            media_type="text/markdown",
            headers={"Content-Disposition": f'attachment; filename="{filename}-mindmap.md"'},
        )
