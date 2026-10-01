"""Google Classroom connect + sync routes.

The flow: /authorize redirects to Google consent, /callback exchanges the
code for tokens (stored per user), /sync pulls courses + coursework into the
classes/assignments tables with source='google_classroom' (idempotent by
external_id). Everything 503s with a reason until GOOGLE_CLIENT_ID +
GOOGLE_CLIENT_SECRET + RESEARCH_PUBLIC_BASE_URL are configured.
"""
from __future__ import annotations

import hmac
from datetime import datetime, timedelta

import httpx
from fastapi import Depends, FastAPI, HTTPException
from fastapi.responses import RedirectResponse

from api.deps import get_current_user, get_store
from core import classroom
from core.models import ClassroomStatus, ClassroomSyncResult, User, utcnow


def _config_or_503() -> tuple[str, str]:
    config = classroom.client_config()
    if config is None:
        raise HTTPException(
            status_code=503,
            detail="Google Classroom is not configured on this server",
        )
    return config


def register(app: FastAPI) -> None:
    @app.get("/api/classroom/status", response_model=ClassroomStatus)
    def status(user: User = Depends(get_current_user)):
        configured = classroom.client_config() is not None
        tokens = get_store(app).get_google_tokens(user.id)
        connected = tokens is not None
        last_sync = None
        if tokens and tokens.get("last_sync_at"):
            try:
                last_sync = datetime.fromisoformat(tokens["last_sync_at"])
            except ValueError:
                last_sync = None
        return ClassroomStatus(
            enabled=configured,
            connected=connected,
            last_sync_at=last_sync,
            reason=None if configured else "server is not configured for Google Classroom",
        )

    @app.get("/api/classroom/authorize")
    def authorize(user: User = Depends(get_current_user)):
        """Return the consent URL (JSON, not a redirect): the browser hop to
        Google cannot carry the bearer header, so the client navigates itself
        to the URL we hand back."""
        client_id, client_secret = _config_or_503()
        try:
            redirect_uri = classroom.public_redirect_uri()
        except classroom.ClassroomError as exc:
            raise HTTPException(status_code=exc.status, detail=str(exc)) from exc
        state = classroom.state_for(user.id, client_secret, utcnow().date().isoformat())
        return {"authorize_url": classroom.authorize_url(client_id, redirect_uri, state)}

    @app.get("/api/classroom/callback")
    def callback(code: str = "", state: str = ""):
        """Google redirects here with the authorization code.

        Unauthenticated by design (Google's browser hop carries no bearer);
        the state parameter binds the round trip to the user + day.
        """
        client_id, client_secret = _config_or_503()
        try:
            redirect_uri = classroom.public_redirect_uri()
        except classroom.ClassroomError as exc:
            raise HTTPException(status_code=exc.status, detail=str(exc)) from exc
        store = get_store(app)
        user_id = _user_for_state(client_secret, state)
        if not code or user_id is None:
            raise HTTPException(status_code=400, detail="invalid classroom callback")
        now = utcnow()
        with httpx.Client() as http:
            try:
                payload = classroom.exchange_code(
                    http, client_id, client_secret, code, redirect_uri
                )
            except classroom.ClassroomError as exc:
                raise HTTPException(status_code=exc.status, detail=str(exc)) from exc
        store.save_google_tokens(
            user_id,
            payload["access_token"],
            payload.get("refresh_token", ""),
            classroom.token_expiry(payload, now),
            classroom.SCOPES,
        )
        return RedirectResponse("/?classroom=connected")

    @app.post("/api/classroom/sync", response_model=ClassroomSyncResult)
    def sync(user: User = Depends(get_current_user)):
        client_id, client_secret = _config_or_503()
        store = get_store(app)
        tokens = store.get_google_tokens(user.id)
        if not tokens:
            raise HTTPException(
                status_code=400, detail="connect Google Classroom first"
            )
        now = utcnow()
        access_token = tokens["access_token"]
        try:
            expires_at = datetime.fromisoformat(tokens["expires_at"])
        except ValueError:
            expires_at = now - timedelta(seconds=1)
        if expires_at <= now + timedelta(seconds=60):
            with httpx.Client() as http:
                try:
                    payload = classroom.refresh_access_token(
                        http, client_id, client_secret, tokens["refresh_token"]
                    )
                except classroom.ClassroomError as exc:
                    if exc.status == 401:
                        store.delete_google_tokens(user.id)
                        raise HTTPException(
                            status_code=409,
                            detail="Google Classroom connection expired — reconnect",
                        ) from exc
                    raise HTTPException(status_code=exc.status, detail=str(exc)) from exc
            access_token = payload["access_token"]
            store.save_google_tokens(
                user.id, access_token, tokens["refresh_token"],
                classroom.token_expiry(payload, now), classroom.SCOPES,
            )
        classes_synced = 0
        assignments_synced = 0
        assignments_skipped = 0
        with httpx.Client() as http:
            try:
                courses = classroom.list_courses(http, access_token)
                for course in courses[: classroom._MAX_COURSES]:
                    klass = store.upsert_classroom_class(
                        user.id, str(course.get("id", "")), str(course.get("name", "Class"))
                    )
                    classes_synced += 1
                    work = classroom.list_coursework(http, access_token, str(course.get("id")))
                    for item in work:
                        due = classroom.parse_due(item)
                        if due is None:
                            assignments_skipped += 1
                            continue
                        _, created = store.upsert_classroom_assignment(
                            user.id, klass.id, str(item.get("id", "")),
                            str(item.get("title", "Coursework")),
                            due, str(item.get("description", "") or ""),
                        )
                        if created:
                            assignments_synced += 1
            except classroom.ClassroomError as exc:
                raise HTTPException(status_code=exc.status, detail=str(exc)) from exc
        store.set_classroom_sync(user.id, now)
        return ClassroomSyncResult(
            classes_synced=classes_synced,
            assignments_synced=assignments_synced,
            assignments_skipped=assignments_skipped,
        )

    @app.delete("/api/classroom/connection", status_code=204)
    def disconnect(user: User = Depends(get_current_user)):
        get_store(app).delete_google_tokens(user.id)


def _user_for_state(client_secret: str, state: str) -> str | None:
    """Recover the user id from state = digest.user_id (stateless CSRF).

    The Google redirect reaches the callback with no session, so the state
    carries the user verifiably. Today's and yesterday's windows are accepted
    so a consent page left open overnight still completes.
    """
    digest, _, user_id = state.rpartition(".")
    if not digest or not user_id:
        return None
    now = utcnow()
    for day in (now.date().isoformat(), (now - timedelta(days=1)).date().isoformat()):
        if hmac.compare_digest(digest, classroom.state_digest(user_id, client_secret, day)):
            return user_id
    return None
