"""Keyless humanizer: flag AI-sounding patterns for free, rewrite with AI only
when the user configured a provider key. Analysis never needs a key."""
from __future__ import annotations

from fastapi import Depends, FastAPI, HTTPException

from api.deps import get_current_user, get_store
from core import humanize, providers
from core.models import (
    HumanizeAnalyzeRequest,
    HumanizeAnalyzeResponse,
    HumanizeFinding,
    HumanizeRewriteRequest,
    HumanizeRewriteResponse,
    User,
)


def register(app: FastAPI) -> None:
    @app.post("/api/humanize/analyze", response_model=HumanizeAnalyzeResponse)
    def analyze(body: HumanizeAnalyzeRequest):
        findings = [HumanizeFinding(**f) for f in humanize.analyze(body.text)]
        return HumanizeAnalyzeResponse(findings=findings, signal_count=len(findings))

    @app.post("/api/humanize/rewrite", response_model=HumanizeRewriteResponse)
    def rewrite(body: HumanizeRewriteRequest, user: User = Depends(get_current_user)):
        store = get_store(app)
        key = store.ai_key(user.id)
        configured = store.get_ai_settings(user.id)
        if not key or not configured.model:
            raise HTTPException(
                status_code=503,
                detail="add an AI provider key in Settings to rewrite with AI",
            )
        try:
            answer, used_model = providers.generate(
                configured.provider,
                key,
                configured.model,
                humanize.build_rewrite_prompt(body.text, body.voice_sample),
            )
        except providers.AIError as exc:
            raise HTTPException(status_code=502, detail=str(exc)) from exc
        return HumanizeRewriteResponse(text=answer, model=used_model)
