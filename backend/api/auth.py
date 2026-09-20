"""Email + password auth for the hosted multi-user backend.

Passwords never touch disk in the clear (pbkdf2 stored, stdlib only). Login
returns a random bearer token; only its SHA-256 lives in the database, valid
30 days. Google OAuth and Sign in with Apple come later; the routes here stay.
"""
from __future__ import annotations

import re

from fastapi import Depends, FastAPI, HTTPException, Request

from api.deps import get_current_user, get_store
from core.google_auth import GoogleAuthError, client_id, verify_google_id_token
from core.models import (
    AuthResponse,
    GoogleLoginRequest,
    LoginRequest,
    RegisterRequest,
    User,
    UserPublic,
)
from core.store import verify_password

_EMAIL = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def _public(user: User) -> UserPublic:
    return UserPublic(id=user.id, email=user.email)


def _verify_google_token(id_token: str) -> tuple[str, str]:
    """Hookable wrapper so tests can stub Google verification."""
    cid = client_id()
    if not cid:
        raise GoogleAuthError("Google login is not configured")
    return verify_google_id_token(id_token, cid)


def register(app: FastAPI) -> None:
    @app.post("/api/auth/register", response_model=AuthResponse, status_code=201)
    def register_user(body: RegisterRequest):
        email = body.email.strip().lower()
        if not _EMAIL.match(email):
            raise HTTPException(status_code=400, detail="enter a valid email address")
        store = get_store(app)
        try:
            user = store.create_user(email, body.password)
        except ValueError:
            raise HTTPException(status_code=409, detail="email already registered")
        token, _ = store.create_session(user.id)
        return AuthResponse(user=_public(user), token=token)

    @app.post("/api/auth/login", response_model=AuthResponse)
    def login(body: LoginRequest):
        store = get_store(app)
        found = store.get_user_by_email(body.email)
        if found is None or not verify_password(body.password, found[1]):
            raise HTTPException(status_code=401, detail="wrong email or password")
        token, _ = store.create_session(found[0].id)
        return AuthResponse(user=_public(found[0]), token=token)

    @app.post("/api/auth/logout", status_code=204)
    def logout(request: Request, user: User = Depends(get_current_user)):
        get_store(app).delete_session(request.headers.get("authorization", "")[7:])

    @app.get("/api/auth/me", response_model=UserPublic)
    def me(user: User = Depends(get_current_user)):
        return _public(user)

    @app.get("/api/auth/google/status")
    def google_status():
        cid = client_id()
        return {"enabled": bool(cid), "client_id": cid}

    @app.post("/api/auth/google", response_model=AuthResponse)
    def google_login(body: GoogleLoginRequest):
        if not client_id():
            raise HTTPException(status_code=503, detail="Google login is not configured")
        try:
            email, google_sub = _verify_google_token(body.id_token)
        except GoogleAuthError as exc:
            if "not configured" in str(exc):
                raise HTTPException(status_code=503, detail=str(exc)) from exc
            raise HTTPException(status_code=401, detail="invalid Google credential") from exc
        store = get_store(app)
        user = store.get_user_by_google_sub(google_sub)
        if user is None:
            existing = store.get_user_by_email(email)
            if existing is not None:
                user = existing[0]
                try:
                    store.set_user_google_sub(user.id, google_sub)
                except ValueError as exc:
                    raise HTTPException(
                        status_code=409, detail="Google account already linked"
                    ) from exc
            else:
                try:
                    user = store.create_google_user(email, google_sub)
                except ValueError:
                    existing = store.get_user_by_email(email)
                    if existing is None:
                        raise
                    user = existing[0]
                    try:
                        store.set_user_google_sub(user.id, google_sub)
                    except ValueError as exc:
                        raise HTTPException(
                            status_code=409, detail="Google account already linked"
                        ) from exc
        token, _ = store.create_session(user.id)
        return AuthResponse(user=_public(user), token=token)
