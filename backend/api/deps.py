"""Shared FastAPI dependencies and helpers.

Every route module imports from here so id validation, store access, and the
notebook-not-found check live in one place.
"""
from __future__ import annotations

import re

from fastapi import HTTPException, Path, Request

from core.models import User
from core.store import Store

# IDs are produced by core.store.new_id() as 12 lowercase hex chars. Anything else
# is rejected at the route boundary to prevent path traversal in the JSON store.
_ID = re.compile(r"^[a-f0-9]{12}$")


def safe_id(value: str = Path(...), name: str = "id") -> str:
    """FastAPI dependency: validate that a path id matches new_id()'s shape."""
    if not _ID.match(value):
        raise HTTPException(status_code=400, detail=f"invalid {name}")
    return value


def get_store(app) -> Store:
    """Return the per-app Store singleton (set in lifespan)."""
    return app.state.store


def notebook_or_404(store: Store, user_id: str, notebook_id: str):
    """Look up a notebook by id for its owner; raise 404 if absent or foreign."""
    nb = store.get_notebook(user_id, notebook_id)
    if not nb:
        raise HTTPException(status_code=404, detail="notebook not found")
    return nb


def get_current_user(request: Request) -> User:
    """Bearer-token auth: missing, unknown, or expired token → 401."""
    auth = request.headers.get("authorization", "")
    if not auth.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="login required")
    user = request.app.state.store.get_session_user(auth[7:].strip())
    if not user:
        raise HTTPException(status_code=401, detail="login required")
    return user