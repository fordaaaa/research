"""Search routes."""
from __future__ import annotations

from fastapi import FastAPI, Query

from api.deps import get_store, notebook_or_404, safe_id


def register(app: FastAPI) -> None:
    @app.get("/api/notebooks/{notebook_id}/search")
    def search_notebook(
        notebook_id: str,
        q: str = Query(min_length=1, max_length=500),
        kind: str | None = Query(default=None, description="filter by source kind"),
        source: list[str] = Query(default=[], description="filter to specific source ids"),
        tag: list[str] = Query(default=[], description="filter to sources with any of these tags"),
        limit: int = Query(default=10, ge=1, le=100),
        offset: int = Query(default=0, ge=0),
    ):
        notebook_id = safe_id(notebook_id, "notebook_id")
        notebook_or_404(get_store(app), notebook_id)
        return get_store(app).search(
            notebook_id,
            q,
            kind=kind,
            source_ids=source,
            tags=tag,
            limit=limit,
            offset=offset,
        )