"""Local-runtime privacy boundary facts.

Pure logic with no framework imports. The desktop shell serves the shared
FastAPI backend as a loopback sidecar; this module states that boundary in
one place so the `/api/runtime` route, docs, and tests cannot drift apart.

Network egress is explicit-only: web search, URL ingest, BYOK AI, and Google
OAuth each run solely on a direct user action. There is no implicit sync,
telemetry, proxy, or evasion behavior.
"""
from __future__ import annotations

EXPLICIT_EGRESS: tuple[str, ...] = (
    "web-search-explicit",
    "url-ingest-explicit",
    "byok-ai-explicit",
    "google-oauth-explicit",
)


def describe_runtime(desktop_session_required: bool) -> dict[str, object]:
    """Return the privacy boundary facts without user data or paths."""
    desktop = bool(desktop_session_required)
    return {
        "mode": "desktop" if desktop else "server",
        "loopback_only": desktop,
        "desktop_session_required": desktop,
        "account_required": True,
        "ai_required": False,
        "network_egress": list(EXPLICIT_EGRESS),
    }
