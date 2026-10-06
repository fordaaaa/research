"""Search routes."""
from __future__ import annotations

import time

from fastapi import Depends, FastAPI, Query, Response

from api.deps import get_current_user, get_store, notebook_or_404, safe_id
from core.models import User
from core.related import related_search


def register(app: FastAPI) -> None:
    @app.get("/api/notebooks/{notebook_id}/search")
    def search_notebook(
        notebook_id: str,
        response: Response,
        q: str = Query(min_length=1, max_length=500),
        kind: str | None = Query(default=None, description="filter by source kind"),
        source: list[str] = Query(default=[], description="filter to specific source ids"),
        tag: list[str] = Query(default=[], description="filter to sources with any of these tags"),
        limit: int = Query(default=10, ge=1, le=100),
        offset: int = Query(default=0, ge=0),
        related: bool = Query(default=False, description="include supported related terms and unambiguous typos"),
        user: User = Depends(get_current_user),
    ):
        notebook_id = safe_id(notebook_id, "notebook_id")
        notebook_or_404(get_store(app), user.id, notebook_id)
        start = time.perf_counter()
        store = get_store(app)
        search = (lambda *args, **kwargs: related_search(store, *args, **kwargs)) if related else store.search_with_total
        hits, total = search(
            notebook_id,
            q,
            kind=kind,
            source_ids=source,
            tags=tag,
            limit=limit,
            offset=offset,
        )
        elapsed_ms = int((time.perf_counter() - start) * 1000)
        response.headers["X-Search-Took-Ms"] = str(max(elapsed_ms, 0))
        response.headers["X-Search-Total"] = str(total)
        store.mark_progress(user.id, "search")
        return hits
