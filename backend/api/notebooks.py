"""Notebook CRUD routes — registered onto the FastAPI app from main.py.

Each `register(app)` function attaches this module's routes to `app`. This keeps
every route file easy to read and avoids hidden side effects at import time.
"""
from __future__ import annotations

from fastapi import FastAPI, HTTPException

from api.deps import get_store, notebook_or_404, safe_id
from core.models import NotebookCreate


def register(app: FastAPI) -> None:
    @app.post("/api/notebooks", status_code=201)
    def create_notebook(body: NotebookCreate):
        return get_store(app).create_notebook(body.name)

    @app.get("/api/notebooks")
    def list_notebooks():
        return get_store(app).list_notebooks()

    @app.delete("/api/notebooks/{notebook_id}", status_code=204)
    def delete_notebook(notebook_id: str):
        notebook_id = safe_id(notebook_id, "notebook_id")
        if not get_store(app).delete_notebook(notebook_id):
            raise HTTPException(status_code=404, detail="notebook not found")