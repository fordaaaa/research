"""Keyless public web discovery routes."""
from __future__ import annotations

from fastapi import FastAPI, HTTPException, Query

from core.websearch import WebSearchError, search_web


def register(app: FastAPI) -> None:
    @app.get("/api/web/search")
    def search_the_web(
        q: str = Query(min_length=1, max_length=500),
        limit: int = Query(default=8, ge=1, le=10),
    ):
        try:
            return search_web(q, limit)
        except WebSearchError as exc:
            raise HTTPException(status_code=503, detail=str(exc)) from exc
