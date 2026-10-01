"""Google Classroom bridge: OAuth exchange/refresh and REST pulls.

Uses raw httpx against Google's REST endpoints (no client library, keeping
the backend dependency-free). The httpx Client is injected so tests can
substitute canned transports. Scopes are read-only: courses and coursework.
"""
from __future__ import annotations

import hmac
import hashlib
import os
from datetime import datetime, timedelta, timezone
from urllib.parse import urlencode

import httpx

AUTH_BASE = "https://accounts.google.com/o/oauth2/v2/auth"
TOKEN_URL = "https://oauth2.googleapis.com/token"
API_BASE = "https://classroom.googleapis.com/v1"

SCOPES = [
    "https://www.googleapis.com/auth/classroom.courses.readonly",
    "https://www.googleapis.com/auth/classroom.coursework.students.readonly",
]
_MAX_COURSES = 30
_MAX_COURSEWORK_PER_COURSE = 100
_TIMEOUT = 15.0


class ClassroomError(Exception):
    def __init__(self, message: str, status: int = 502) -> None:
        super().__init__(message)
        self.status = status


def client_config() -> tuple[str, str] | None:
    """(client_id, client_secret) when both env vars are set, else None."""
    client_id = os.environ.get("GOOGLE_CLIENT_ID", "").strip()
    client_secret = os.environ.get("GOOGLE_CLIENT_SECRET", "").strip()
    if not client_id or not client_secret:
        return None
    return client_id, client_secret


def public_redirect_uri() -> str:
    """Callback URL registered in the Google Cloud console."""
    base = os.environ.get("RESEARCH_PUBLIC_BASE_URL", "").strip().rstrip("/")
    if base:
        return f"{base}/api/classroom/callback"
    raise ClassroomError(
        "RESEARCH_PUBLIC_BASE_URL must be set so Google can reach /api/classroom/callback",
        status=503,
    )


def state_digest(user_id: str, client_secret: str, today: str) -> str:
    """HMAC over user + day — unforgeable CSRF material without a session."""
    message = f"classroom:{user_id}:{today}".encode()
    return hmac.new(client_secret.encode(), message, hashlib.sha256).hexdigest()


def state_for(user_id: str, client_secret: str, today: str) -> str:
    """Stateless CSRF state: digest + plain user id, so the callback (which
    Google's browser hop reaches with no bearer token) can recover the user."""
    return f"{state_digest(user_id, client_secret, today)}.{user_id}"


def authorize_url(client_id: str, redirect_uri: str, state: str) -> str:
    params = {
        "client_id": client_id,
        "redirect_uri": redirect_uri,
        "response_type": "code",
        "scope": " ".join(SCOPES),
        "access_type": "offline",
        "include_granted_scopes": "true",
        "prompt": "consent",
        "state": state,
    }
    return f"{AUTH_BASE}?{urlencode(params)}"


def exchange_code(
    http: httpx.Client, client_id: str, client_secret: str,
    code: str, redirect_uri: str,
) -> dict:
    response = http.post(
        TOKEN_URL,
        data={
            "code": code, "client_id": client_id, "client_secret": client_secret,
            "redirect_uri": redirect_uri, "grant_type": "authorization_code",
        },
        timeout=_TIMEOUT,
    )
    if response.status_code != 200:
        raise ClassroomError(f"token exchange failed ({response.status_code})")
    payload = response.json()
    if "access_token" not in payload:
        raise ClassroomError("token exchange returned no access token")
    return payload


def refresh_access_token(
    http: httpx.Client, client_id: str, client_secret: str, refresh_token: str,
) -> dict:
    response = http.post(
        TOKEN_URL,
        data={
            "refresh_token": refresh_token, "client_id": client_id,
            "client_secret": client_secret, "grant_type": "refresh_token",
        },
        timeout=_TIMEOUT,
    )
    if response.status_code != 200:
        raise ClassroomError(f"token refresh failed ({response.status_code})", status=401)
    return response.json()


def _get_json(http: httpx.Client, url: str, access_token: str, params: dict | None = None) -> list | dict:
    response = http.get(
        url, params=params,
        headers={"Authorization": f"Bearer {access_token}"}, timeout=_TIMEOUT,
    )
    if response.status_code != 200:
        raise ClassroomError(f"classroom api failed ({response.status_code})")
    return response.json()


def list_courses(http: httpx.Client, access_token: str) -> list[dict]:
    payload = _get_json(http, f"{API_BASE}/courses", access_token,
                        params={"pageSize": _MAX_COURSES})
    return payload.get("courses", []) if isinstance(payload, dict) else []


def list_coursework(
    http: httpx.Client, access_token: str, course_id: str,
) -> list[dict]:
    payload = _get_json(
        http, f"{API_BASE}/courses/{course_id}/courseWork", access_token,
        params={"pageSize": _MAX_COURSEWORK_PER_COURSE},
    )
    return payload.get("courseWork", []) if isinstance(payload, dict) else []


def parse_due(coursework: dict) -> datetime | None:
    """Combine dueDate {year, month, day} + dueTime {hours, minutes} into UTC.

    Google returns coursework due dates without timezone; the default time is
    23:59 local-to-the-class, which we cannot know, so we anchor to UTC end of
    day as the least-wrong bucket for a calendar view.
    """
    due_date = coursework.get("dueDate")
    if not due_date:
        return None
    due_time = coursework.get("dueTime") or {}
    hour = due_time.get("hours", 23)
    minute = due_time.get("minutes", 59)
    try:
        return datetime(
            int(due_date["year"]), int(due_date["month"]), int(due_date["day"]),
            int(hour), int(minute), tzinfo=timezone.utc,
        )
    except (KeyError, TypeError, ValueError):
        return None


def token_expiry(payload: dict, fallback: datetime) -> datetime:
    seconds = payload.get("expires_in")
    try:
        return fallback + timedelta(seconds=int(seconds))
    except (TypeError, ValueError):
        return fallback
