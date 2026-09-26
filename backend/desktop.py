"""Local loopback server used by the native macOS application.

Binds 127.0.0.1 only on an ephemeral port. The shell passes a per-launch
RESEARCH_DESKTOP_TOKEN which the API exchanges for an HttpOnly session
cookie; the account login (Bearer) is still mandatory on data routes.
"""

from __future__ import annotations

import os
import socket
import sys
from pathlib import Path

import uvicorn

from api.main import create_app

DESKTOP_HOST = "127.0.0.1"


def web_root() -> Path:
    """Find the Vite build copied beside a packaged sidecar or supplied by macOS."""
    configured = os.environ.get("RESEARCH_WEB_DIR")
    candidates = [Path(configured)] if configured else []
    bundle_root = getattr(sys, "_MEIPASS", None)
    if bundle_root:
        candidates.append(Path(bundle_root) / "web")
    candidates.append(Path(sys.executable).resolve().parent / "web")
    for candidate in candidates:
        if (candidate / "index.html").is_file():
            return candidate
    raise RuntimeError("research frontend assets are missing")


def serve() -> None:
    """Bind an ephemeral loopback port and announce it before serving requests."""
    listener = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    listener.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    listener.bind((DESKTOP_HOST, 0))
    listener.listen()
    port = listener.getsockname()[1]
    print(f"RESEARCH_READY http://{DESKTOP_HOST}:{port}", flush=True)
    # proxy_headers=False is load-bearing: uvicorn defaults it to True, which
    # installs ProxyHeadersMiddleware and rewrites scope["client"] from
    # X-Forwarded-For for trusted (loopback) peers — letting any local process
    # mint fresh auth rate-limit buckets with a spoofed header. The sidecar is
    # loopback-only with no reverse proxy, so the header must never be
    # honored; api/auth.py keys buckets on the TCP peer IP. Pinned explicitly
    # (not relying on the installed default) for forward-compat.
    config = uvicorn.Config(
        create_app(web_root()),
        host=DESKTOP_HOST,
        port=port,
        log_level="warning",
        proxy_headers=False,
    )
    uvicorn.Server(config).run(sockets=[listener])


if __name__ == "__main__":
    serve()
