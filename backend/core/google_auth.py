"""Verify Google ID tokens for Sign in with Google.

Token verification uses Google's tokeninfo endpoint over httpx (already a
dependency) so no new crypto/JWKS code is needed. The frontend obtains an ID
token via Google Identity Services; the backend verifies it here and maps the
Google subject to a local user in `core.store`.
"""
from __future__ import annotations

import os
import time

import httpx

_TOKENINFO_URL = "https://oauth2.googleapis.com/tokeninfo"
_TIMEOUT = 10.0


class GoogleAuthError(Exception):
    """Raised when a Google ID token is missing, invalid, or expired."""


def client_id() -> str | None:
    """Return the configured Google OAuth client ID, or None when disabled."""
    cid = os.environ.get("GOOGLE_CLIENT_ID", "").strip()
    return cid or None


def verify_google_id_token(id_token: str, expected_client_id: str) -> tuple[str, str]:
    """Verify `id_token` with Google and return (email, google_sub)."""
    if not id_token or not id_token.strip():
        raise GoogleAuthError("missing Google credential")
    try:
        resp = httpx.get(
            _TOKENINFO_URL,
            params={"id_token": id_token.strip()},
            timeout=_TIMEOUT,
            headers={"User-Agent": "research/0.1 (google oauth)"},
        )
        if resp.status_code != 200:
            raise GoogleAuthError("invalid Google credential")
        payload = resp.json()
    except GoogleAuthError:
        raise
    except Exception as exc:
        raise GoogleAuthError("could not verify Google credential") from exc
    if payload.get("aud") != expected_client_id:
        raise GoogleAuthError("invalid Google credential")
    try:
        if int(payload.get("exp", 0)) < int(time.time()):
            raise GoogleAuthError("expired Google credential")
    except (TypeError, ValueError) as exc:
        raise GoogleAuthError("invalid Google credential") from exc
    if str(payload.get("email_verified", "")).lower() not in ("true", "1"):
        raise GoogleAuthError("Google email is not verified")
    email = str(payload.get("email", "")).strip().lower()
    sub = str(payload.get("sub", "")).strip()
    if not email or "@" not in email or not sub:
        raise GoogleAuthError("invalid Google credential")
    return email, sub
