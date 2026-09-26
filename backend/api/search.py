"""Search routes."""
from __future__ import annotations

import time

from fastapi import Depends, FastAPI, Query, Response

from api.deps import get_current_user, get_store, notebook_or_404, safe_id
from core.models import User


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
        user: User = Depends(get_current_user),
    ):
        notebook_id = safe_id(notebook_id, "notebook_id")
        notebook_or_404(get_store(app), user.id, notebook_id)
        start = time.perf_counter()
        store = get_store(app)
        hits = store.search(
            notebook_id,
            q,
            kind=kind,
            source_ids=source,
            tags=tag,
            limit=limit,
            offset=offset,
        )
        # Pre-slice total for honest count announcements / pagination. The body
        # stays a bare list (mobile + tests depend on it), so the total rides
        # along as a header mirroring X-Search-Took-Ms. The paginated query
        # above is untouched; this second unpaginated query only counts.
        total = len(
            store.search(
                notebook_id,
                q,
                kind=kind,
                source_ids=source,
                tags=tag,
                limit=1_000_000,
                offset=0,
            )
        )
        elapsed_ms = int((time.perf_counter() - start) * 1000)
        response.headers["X-Search-Took-Ms"] = str(max(elapsed_ms, 0))
        response.headers["X-Search-Total"] = str(total)
        store.mark_progress(user.id, "search")
        return hits
