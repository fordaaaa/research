"""FastAPI app factory: lifespan, CORS, exception handler, and route mounting.

All route handlers live in `api.notebooks`, `api.sources`, and `api.search`.
Edit those files when adding or changing endpoints. Helpers (id validation,
store access, notebook-not-found) live in `api.deps`.
"""
from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from api import notebooks, search, sources
from core.store import Store

logger = logging.getLogger("api")
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")


@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.store = Store()
    yield


app = FastAPI(title="research", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(Exception)
async def _unhandled(request: Request, exc: Exception) -> JSONResponse:
    logger.exception("unhandled exception on %s %s", request.method, request.url.path)
    return JSONResponse(status_code=500, content={"detail": "internal server error"})


@app.get("/api/health")
def health():
    return {"ok": True}


# Mount route modules. Add a new register() call here when adding endpoints.
notebooks.register(app)
sources.register(app)
search.register(app)

