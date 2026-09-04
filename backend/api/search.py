"""Search routes."""
from __future__ import annotations

from fastapi import FastAPI, Query

from api.deps import get_store, notebook_or_404, safe_id


def register(app: FastAPI) -> None:
    @app.get("/api/notebooks/{notebook_id}/search")
    def search_notebook(
        notebook_id: str,
        q: str = Query(min_length=1, max_length=500),
    ):
        notebook_id = safe_id(notebook_id, "notebook_id")
        notebook_or_404(get_store(app), notebook_id)
        return get_store(app).search(notebook_id, q)