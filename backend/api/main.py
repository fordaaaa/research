"""FastAPI app factory: lifespan, CORS, exception handler, and route mounting.

All route handlers live in `api.notebooks`, `api.sources`, and `api.search`.
Edit those files when adding or changing endpoints. Helpers (id validation,
store access, notebook-not-found) live in `api.deps`.
"""
from __future__ import annotations

import hmac
import logging
import os
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.responses import RedirectResponse
from fastapi.staticfiles import StaticFiles

from api import ai, auth, demo, humanize, notebooks, notes, outlines, research, search, skills, sources, study, web
from core.local_runtime import describe_runtime
from core.store import Store

logger = logging.getLogger("api")
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")

DESKTOP_COOKIE = "research_session"
DESKTOP_TOKEN_PARAM = "desktop_token"
# The packaged shell loads the sidecar root ("/"); "/index.html" covers a
# direct index request through StaticFiles with the same per-launch token.
DESKTOP_EXCHANGE_PATHS = frozenset({"/", "/index.html"})


def _token_matches(supplied: str | None, expected: str) -> bool:
    if not supplied or not expected:
        return False
    try:
        return hmac.compare_digest(supplied.encode(), expected.encode())
    except (ValueError, TypeError):
        return False


@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.store = Store()
    yield


def create_app(web_dir: Path | None = None) -> FastAPI:
    """Create the API, optionally serving a built frontend at the site root."""
    app = FastAPI(title="research", version="0.1.0", lifespan=lifespan)
    desktop_token = os.environ.get("RESEARCH_DESKTOP_TOKEN") or None
    # Desktop sidecar is same-origin only (WKWebView on a loopback port);
    # development keeps the Vite origin so `npm run dev` can call the API.
    app.add_middleware(
        CORSMiddleware,
        allow_origins=[] if desktop_token else ["http://localhost:5173"],
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.middleware("http")
    async def desktop_session(request: Request, call_next):
        if desktop_token:
            supplied = request.query_params.get(DESKTOP_TOKEN_PARAM)
            if request.url.path in DESKTOP_EXCHANGE_PATHS and _token_matches(supplied, desktop_token):
                response = RedirectResponse(url="/", status_code=303)
                response.set_cookie(
                    DESKTOP_COOKIE,
                    desktop_token,
                    path="/",
                    httponly=True,
                    samesite="strict",
                )
                return response
            if request.url.path.startswith("/api/") and request.url.path != "/api/health":
                if not _token_matches(request.cookies.get(DESKTOP_COOKIE), desktop_token):
                    return JSONResponse(status_code=403, content={"detail": "desktop session required"})

        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Content-Security-Policy"] = (
            "default-src 'self';"
            " script-src 'self' https://accounts.google.com;"
            " frame-src https://accounts.google.com;"
            " connect-src 'self' https://accounts.google.com https://oauth2.googleapis.com"
        )
        return response

    @app.exception_handler(Exception)
    async def _unhandled(request: Request, exc: Exception) -> JSONResponse:
        logger.exception("unhandled exception on %s %s", request.method, request.url.path)
        return JSONResponse(status_code=500, content={"detail": "internal server error"})

    @app.get("/api/health")
    def health():
        return {"ok": True}

    @app.get("/api/runtime")
    def runtime():
        """Local-runtime privacy boundary facts; no user data, no paths."""
        return describe_runtime(bool(desktop_token))

    # Mount route modules before the frontend so /api always wins over assets.
    notebooks.register(app)
    notes.register(app)
    auth.register(app)
    demo.register(app)
    sources.register(app)
    search.register(app)
    web.register(app)
    ai.register(app)
    humanize.register(app)
    skills.register(app)
    study.register(app)
    research.register(app)
    outlines.register(app)
    if web_dir is not None:
        app.mount("/", StaticFiles(directory=web_dir, html=True), name="web")
    return app


app = create_app()
