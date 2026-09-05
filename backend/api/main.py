"""FastAPI app factory: lifespan, CORS, exception handler, and route mounting.

All route handlers live in `api.notebooks`, `api.sources`, and `api.search`.
Edit those files when adding or changing endpoints. Helpers (id validation,
store access, notebook-not-found) live in `api.deps`.
"""
from __future__ import annotations

import logging
import os
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.responses import RedirectResponse
from fastapi.staticfiles import StaticFiles

from api import ai, notebooks, search, sources, web
from core.store import Store

logger = logging.getLogger("api")
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")


@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.store = Store()
    yield


def create_app(web_dir: Path | None = None) -> FastAPI:
    """Create the API, optionally serving a built frontend at the site root."""
    app = FastAPI(title="research", version="0.1.0", lifespan=lifespan)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["http://localhost:5173"],
        allow_methods=["*"],
        allow_headers=["*"],
    )

    desktop_token = os.environ.get("RESEARCH_DESKTOP_TOKEN")

    @app.middleware("http")
    async def desktop_session(request: Request, call_next):
        if desktop_token:
            supplied = request.query_params.get("desktop_token")
            if supplied == desktop_token and request.url.path == "/":
                response = RedirectResponse(url="/", status_code=303)
                response.set_cookie(
                    "research_session",
                    desktop_token,
                    httponly=True,
                    samesite="strict",
                )
                return response
            if request.url.path.startswith("/api/") and request.url.path != "/api/health":
                if request.cookies.get("research_session") != desktop_token:
                    return JSONResponse(status_code=403, content={"detail": "desktop session required"})

        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Content-Security-Policy"] = "default-src 'self'; connect-src 'self'"
        return response

    @app.exception_handler(Exception)
    async def _unhandled(request: Request, exc: Exception) -> JSONResponse:
        logger.exception("unhandled exception on %s %s", request.method, request.url.path)
        return JSONResponse(status_code=500, content={"detail": "internal server error"})

    @app.get("/api/health")
    def health():
        return {"ok": True}

    # Mount route modules before the frontend so /api always wins over assets.
    notebooks.register(app)
    sources.register(app)
    search.register(app)
    web.register(app)
    ai.register(app)
    if web_dir is not None:
        app.mount("/", StaticFiles(directory=web_dir, html=True), name="web")
    return app


app = create_app()
