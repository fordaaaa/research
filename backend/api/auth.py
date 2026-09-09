"""Email + password auth for the hosted multi-user backend.

Passwords never touch disk in the clear (pbkdf2 stored, stdlib only). Login
returns a random bearer token; only its SHA-256 lives in the database, valid
30 days. Google OAuth and Sign in with Apple come later; the routes here stay.
"""
from __future__ import annotations

import re

from fastapi import Depends, FastAPI, HTTPException, Request

from api.deps import get_current_user, get_store
from core.models import AuthResponse, LoginRequest, RegisterRequest, User, UserPublic
from core.store import verify_password

_EMAIL = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def _public(user: User) -> UserPublic:
    return UserPublic(id=user.id, email=user.email)


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
