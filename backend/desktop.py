"""Local loopback server used by the native macOS application."""
from __future__ import annotations

import os
import socket
import sys
from pathlib import Path

import uvicorn

from api.main import create_app


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
    listener.bind(("127.0.0.1", 0))
    listener.listen()
    port = listener.getsockname()[1]
    print(f"RESEARCH_READY http://127.0.0.1:{port}", flush=True)
    config = uvicorn.Config(create_app(web_root()), host="127.0.0.1", port=port, log_level="warning")
    uvicorn.Server(config).run(sockets=[listener])


if __name__ == "__main__":
    serve()
