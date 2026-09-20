"""Optional, cited notebook chat backed by a user-supplied free-tier key."""
from __future__ import annotations

from fastapi import Depends, FastAPI, HTTPException

from api.deps import get_current_user, get_store, notebook_or_404, safe_id
from core import providers, skills
from core.context import build_context, build_note_excerpts
from core.models import AISettingsUpdate, ChatMessage, ChatRequest, ChatResponse, ChatSession, ChatSessionCreate, User, utcnow
from core.store import new_id

MAX_SESSION_HISTORY_CHARS = 4_000


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

    @app.get("/api/notebooks/{notebook_id}/chat/sessions", response_model=list[ChatSession])
    def list_sessions(notebook_id: str, user: User = Depends(get_current_user)):
        notebook_id = safe_id(notebook_id, "notebook_id")
        store = get_store(app)
        notebook_or_404(store, user.id, notebook_id)
        return store.list_chat_sessions(notebook_id)

    @app.post("/api/notebooks/{notebook_id}/chat/sessions", response_model=ChatSession, status_code=201)
    def create_session(notebook_id: str, body: ChatSessionCreate, user: User = Depends(get_current_user)):
        notebook_id = safe_id(notebook_id, "notebook_id")
        store = get_store(app)
        notebook_or_404(store, user.id, notebook_id)
        now = utcnow()
        return store.create_chat_session(ChatSession(id=new_id(), notebook_id=notebook_id, title=body.title.strip(), created_at=now, updated_at=now))

    @app.get("/api/notebooks/{notebook_id}/chat/sessions/{session_id}", response_model=ChatSession)
    def get_session(notebook_id: str, session_id: str, user: User = Depends(get_current_user)):
        notebook_id = safe_id(notebook_id, "notebook_id")
        session_id = safe_id(session_id, "session_id")
        store = get_store(app)
        notebook_or_404(store, user.id, notebook_id)
        session = store.get_chat_session(notebook_id, session_id)
        if not session:
            raise HTTPException(status_code=404, detail="chat session not found")
        return session

    @app.delete("/api/notebooks/{notebook_id}/chat/sessions/{session_id}", status_code=204)
    def delete_session(notebook_id: str, session_id: str, user: User = Depends(get_current_user)):
        notebook_id = safe_id(notebook_id, "notebook_id")
        session_id = safe_id(session_id, "session_id")
        store = get_store(app)
        notebook_or_404(store, user.id, notebook_id)
        if not store.delete_chat_session(notebook_id, session_id):
            raise HTTPException(status_code=404, detail="chat session not found")

    @app.get("/api/notebooks/{notebook_id}/chat/sessions/{session_id}/messages", response_model=list[ChatMessage])
    def list_messages(notebook_id: str, session_id: str, user: User = Depends(get_current_user)):
        notebook_id = safe_id(notebook_id, "notebook_id")
        session_id = safe_id(session_id, "session_id")
        store = get_store(app)
        notebook_or_404(store, user.id, notebook_id)
        if not store.get_chat_session(notebook_id, session_id):
            raise HTTPException(status_code=404, detail="chat session not found")
        return store.list_chat_messages(session_id)

    @app.post("/api/notebooks/{notebook_id}/chat/sessions/{session_id}/messages", response_model=ChatMessage)
    def session_message(notebook_id: str, session_id: str, body: ChatRequest, user: User = Depends(get_current_user)):
        notebook_id = safe_id(notebook_id, "notebook_id")
        session_id = safe_id(session_id, "session_id")
        store = get_store(app)
        notebook_or_404(store, user.id, notebook_id)
        session = store.get_chat_session(notebook_id, session_id)
        if not session:
            raise HTTPException(status_code=404, detail="chat session not found")
        key = store.ai_key(user.id)
        configured = store.get_ai_settings(user.id)
        if not key or not configured.model:
            raise HTTPException(status_code=503, detail="add an AI provider key in Settings to use AI chat")
        excerpts, citations = build_context(store, notebook_id)
        note_excerpts = build_note_excerpts(store, notebook_id)
        memory = store.get_memory(notebook_id).strip()[:3000]
        if memory:
            note_excerpts.append(memory)
        if not excerpts and not note_excerpts:
            raise HTTPException(status_code=400, detail="add a source or note before asking AI")
        history = store.list_chat_messages(session_id)[-8:]
        history_text = "\n".join(f"{message.role.upper()}: {message.text}" for message in history)
        if len(history_text) > MAX_SESSION_HISTORY_CHARS:
            history_text = history_text[-MAX_SESSION_HISTORY_CHARS:]
        notes_text = "\n\n".join(note_excerpts)
        sources_text = "\n\n".join(excerpts) if excerpts else "(No source excerpts; use the notebook notes below.)"
        prompt = (
            "Answer only from the notebook excerpts below. If the answer is not present, say so. "
            "Use citation markers like [1] for numbered source excerpts; identify notebook notes by title.\n\n"
            "SOURCES:\n" + sources_text + "\n\n"
            f"RECENT CHAT:\n{history_text}\n\nNOTE EXCERPTS:\n{notes_text}\n\nQUESTION: {body.message}"
        )
        try:
            answer, used_model = providers.generate(configured.provider, key, configured.model, prompt)
        except providers.AIError as exc:
            raise HTTPException(status_code=502, detail=str(exc)) from exc
        return store.append_chat_exchange(session, body.message, answer, citations, used_model)

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
