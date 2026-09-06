"""Optional, cited notebook chat backed by a user-supplied free-tier key."""
from __future__ import annotations

from fastapi import FastAPI, HTTPException

from api.deps import get_store, notebook_or_404, safe_id
from core import providers, settings
from core.models import AISettingsUpdate, ChatRequest, ChatResponse, Citation

MAX_CONTEXT = 14_000


def register(app: FastAPI) -> None:
    @app.get("/api/settings/ai")
    def get_settings():
        return settings.get_ai_settings(get_store(app).root)

    @app.put("/api/settings/ai")
    def update_settings(body: AISettingsUpdate):
        return settings.save_ai_settings(get_store(app).root, body)

    @app.delete("/api/settings/ai", status_code=204)
    def delete_settings():
        settings.clear_ai_settings(get_store(app).root)

    @app.post("/api/notebooks/{notebook_id}/chat", response_model=ChatResponse)
    def chat(notebook_id: str, body: ChatRequest):
        notebook_id = safe_id(notebook_id, "notebook_id")
        store = get_store(app)
        notebook_or_404(store, notebook_id)
        key = settings.api_key(store.root)
        configured = settings.get_ai_settings(store.root)
        if not key or not configured.model:
            raise HTTPException(status_code=503, detail="add an AI provider key in Settings to use AI chat")

        excerpts, citations = _context(store, notebook_id)
        if not excerpts:
            raise HTTPException(status_code=400, detail="add a source before asking AI")
        prompt = (
            "Answer only from the notebook excerpts below. If the answer is not present, say so. "
            "Use citation markers like [1] that match the supplied excerpt numbers.\n\n"
            f"QUESTION: {body.message}\n\nSOURCES:\n" + "\n\n".join(excerpts)
        )
        try:
            answer, used_model = providers.generate(configured.provider, key, configured.model, prompt)
        except providers.AIError as exc:
            raise HTTPException(status_code=502, detail=str(exc)) from exc
        return ChatResponse(answer=answer, citations=citations, model=used_model)


def _context(store, notebook_id: str) -> tuple[list[str], list[Citation]]:
    excerpts, citations, size = [], [], 0
    for summary in store.list_sources(notebook_id):
        source = store.get_source(notebook_id, summary.id)
        if not source:
            continue
        for chunk in source.chunks:
            addition = len(chunk.text)
            if excerpts and size + addition > MAX_CONTEXT:
                return excerpts, citations
            number = len(citations) + 1
            excerpts.append(f"[{number}] {source.title}, pages {', '.join(map(str, chunk.pages))}:\n{chunk.text}")
            citations.append(Citation(source_id=source.id, source_title=source.title, pages=chunk.pages))
            size += addition
    return excerpts, citations
