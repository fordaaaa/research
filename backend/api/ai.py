"""Optional, cited notebook chat backed by a user-supplied free-tier key."""
from __future__ import annotations

from fastapi import Depends, FastAPI, HTTPException

from api.deps import get_current_user, get_store, notebook_or_404, safe_id
from core import providers, skills
from core.context import build_context
from core.models import AISettingsUpdate, ChatRequest, ChatResponse, User


def register(app: FastAPI) -> None:
    @app.get("/api/settings/ai")
    def get_settings(user: User = Depends(get_current_user)):
        return get_store(app).get_ai_settings(user.id)

    @app.put("/api/settings/ai")
    def update_settings(body: AISettingsUpdate, user: User = Depends(get_current_user)):
        return get_store(app).save_ai_settings(user.id, body)

    @app.delete("/api/settings/ai", status_code=204)
    def delete_settings(user: User = Depends(get_current_user)):
        get_store(app).clear_ai_settings(user.id)

    @app.post("/api/notebooks/{notebook_id}/chat", response_model=ChatResponse)
    def chat(notebook_id: str, body: ChatRequest, user: User = Depends(get_current_user)):
        notebook_id = safe_id(notebook_id, "notebook_id")
        store = get_store(app)
        notebook_or_404(store, user.id, notebook_id)
        key = store.ai_key(user.id)
        configured = store.get_ai_settings(user.id)
        if not key or not configured.model:
            raise HTTPException(status_code=503, detail="add an AI provider key in Settings to use AI chat")

        excerpts, citations = build_context(store, notebook_id)
        if not excerpts:
            raise HTTPException(status_code=400, detail="add a source before asking AI")
        prompt = (
            "Answer only from the notebook excerpts below. If the answer is not present, say so. "
            "Use citation markers like [1] that match the supplied excerpt numbers.\n\n"
            f"QUESTION: {body.message}\n\nSOURCES:\n" + "\n\n".join(excerpts)
        )
        matched = skills.match_skills(store.list_skills(user.id), body.message)
        if matched:
            prompt += "\n\n" + skills.skills_section(matched)
        notes = store.get_memory(notebook_id)
        if notes.strip():
            prompt += "\n\n" + skills.memory_section(notes.strip())
        try:
            answer, used_model = providers.generate(configured.provider, key, configured.model, prompt)
        except providers.AIError as exc:
            raise HTTPException(status_code=502, detail=str(exc)) from exc
        return ChatResponse(answer=answer, citations=citations, model=used_model)
