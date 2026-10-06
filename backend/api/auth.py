"""Email + password auth for the hosted multi-user backend.

Passwords never touch disk in the clear (pbkdf2 stored, stdlib only). Login
returns a random bearer token; only its SHA-256 lives in the database, valid
30 days. Google OAuth and Sign in with Apple come later; the routes here stay.
"""
from __future__ import annotations

import hashlib
import logging
import math
import os
import re
import time

from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse

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

logger = logging.getLogger("api")


def _email_hash_prefix(email_key: str) -> str:
    """First 8 hex chars of sha256(lowercased email); avoids logging PII."""
    return hashlib.sha256(email_key.encode("utf-8")).hexdigest()[:8]


def _log_rate_limit_trip(guard: str, email_key: str, retry_after: int) -> None:
    logger.warning(
        "login rate limit tripped guard=%s email_hash=%s retry_after=%s",
        guard,
        _email_hash_prefix(email_key),
        retry_after,
    )

# Login rate-limit design (deliberate anti-lockout tradeoff, local-first app):
#
# - The per-key limit (IP + email, 10 failures / 5min) is verify-first: a
#   correct password succeeds and clears the key even when the window is full.
#   This is intentional. Anyone who can reach this server (loopback/LAN in the
#   self-hosted case) could otherwise lock the owner's account at will by
#   spraying wrong passwords for the owner's email — a cheap denial of service
#   that is worse for a single-user local app than the residual risk of a
#   targeted online-guessing attempt against one account.
# - Because verify-first lets a correct password through under the per-key
#   limit, bulk brute force across many accounts is bounded by a second, outer
#   per-IP guard (60 failures / 5min from one IP). The outer guard runs BEFORE
#   password verification, so it applies even to correct passwords, with a
#   Retry-After header. Targeted lockout stays expensive (attacker must burn
#   60+ failures from one IP to block one correct login), while bulk guessing
#   from a single IP is capped.
# - Rotating X-Forwarded-For (or rotating source IPs) per request defeats both
#   the per-key (IP+email) and per-IP guards, so a third, email-only outer
#   bucket bounds that rotation: >50 FAILED logins / 5min for one lowercased
#   email (any IP) returns 429 with Retry-After on ALL attempts for that email,
#   including correct passwords. It runs BEFORE verification like the per-IP
#   guard. Rationale: targeted lockout now costs 50 rapid failures (noisy,
#   slow) instead of 10, while bulk rotation guessing is bounded; verify-first
#   still protects under the normal per-key limit (a correct password below the
#   email threshold succeeds and clears its per-key + email buckets).
# - OPERATORS: X-Forwarded-For is IGNORED by default (default-secure). Any
#   local process reaching the app over loopback could otherwise mint fresh
#   rate-limit buckets with a spoofed leftmost XFF entry. To honor the header
#   from a loopback peer (same-host reverse proxy whose XFF you trust),
#   explicitly opt in with RESEARCH_TRUST_XFF=1 (see _client_ip). The legacy
#   RESEARCH_IGNORE_XFF=1 is kept for backward compat and always wins: the
#   header is trusted only when TRUST==1 AND IGNORE!=1. Direct-LAN/desktop
#   behavior is unchanged either way (non-loopback peers ignore the header
#   and use the TCP peer IP). TRUST=1 additionally requires proxy headers to
#   be enabled at the server layer to mean anything (uvicorn rewrites
#   scope["client"] before this code runs); see the SERVER-LAYER PAIRING
#   section in _client_ip for the shipped default matrix.
_MAX_FAILED_LOGINS = 10
_LOGIN_WINDOW_SECONDS = 300.0
_FAILED_LOGINS: dict[str, list[float]] = {}
_MAX_FAILED_LOGINS_PER_IP = 60
_FAILED_LOGINS_BY_IP: dict[str, list[float]] = {}
_MAX_FAILED_LOGINS_BY_EMAIL = 50
_FAILED_LOGINS_BY_EMAIL: dict[str, list[float]] = {}

# Register throttle (unbounded account creation = unbounded SQLite growth):
# 20 successful-or-attempted POSTs / hour per client IP (same _client_ip key
# as the login guards). Checked + recorded BEFORE validation so invalid and
# duplicate attempts also consume the bucket. Cleared by
# reset_login_rate_limits() so the test suite (hundreds of registers from the
# TestClient peer) stays green.
_MAX_REGISTERS_PER_IP = 20
_REGISTER_WINDOW_SECONDS = 3600.0
_REGISTER_ATTEMPTS_BY_IP: dict[str, list[float]] = {}


def reset_login_rate_limits() -> None:
    """Clear all recorded failed logins (used by tests)."""
    _FAILED_LOGINS.clear()
    _FAILED_LOGINS_BY_IP.clear()
    _FAILED_LOGINS_BY_EMAIL.clear()
    _REGISTER_ATTEMPTS_BY_IP.clear()


def _prune_register_attempts(ip: str, now: float) -> list[float]:
    attempts = [t for t in _REGISTER_ATTEMPTS_BY_IP.get(ip, []) if now - t < _REGISTER_WINDOW_SECONDS]
    if attempts:
        _REGISTER_ATTEMPTS_BY_IP[ip] = attempts
    else:
        _REGISTER_ATTEMPTS_BY_IP.pop(ip, None)
    return attempts


def _check_register_rate_limit(ip: str) -> None:
    now = time.monotonic()
    attempts = _prune_register_attempts(ip, now)
    if len(attempts) >= _MAX_REGISTERS_PER_IP:
        oldest = min(attempts) if attempts else now
        retry_after = max(1, int(math.ceil(_REGISTER_WINDOW_SECONDS - (now - oldest))))
        _log_rate_limit_trip("register-per-ip", ip, retry_after)
        raise HTTPException(
            status_code=429,
            detail="too many registrations, try again later",
            headers={"Retry-After": str(retry_after)},
        )


def _record_register_attempt(ip: str) -> None:
    now = time.monotonic()
    attempts = _prune_register_attempts(ip, now)
    attempts.append(now)
    _REGISTER_ATTEMPTS_BY_IP[ip] = attempts


def _prune_failures(key: str, now: float) -> list[float]:
    attempts = [t for t in _FAILED_LOGINS.get(key, []) if now - t < _LOGIN_WINDOW_SECONDS]
    if attempts:
        _FAILED_LOGINS[key] = attempts
    else:
        _FAILED_LOGINS.pop(key, None)
    return attempts


def _check_rate_limit(key: str) -> None:
    now = time.monotonic()
    attempts = _prune_failures(key, now)
    if len(attempts) >= _MAX_FAILED_LOGINS:
        oldest = min(attempts) if attempts else now
        retry_after = max(1, int(math.ceil(_LOGIN_WINDOW_SECONDS - (now - oldest))))
        email_key = key.rsplit("|", 1)[-1] if "|" in key else key
        _log_rate_limit_trip("per-key", email_key, retry_after)
        raise HTTPException(
            status_code=429,
            detail="too many login attempts, try again later",
            headers={"Retry-After": str(retry_after)},
        )


def _prune_ip_failures(ip: str, now: float) -> list[float]:
    attempts = [t for t in _FAILED_LOGINS_BY_IP.get(ip, []) if now - t < _LOGIN_WINDOW_SECONDS]
    if attempts:
        _FAILED_LOGINS_BY_IP[ip] = attempts
    else:
        _FAILED_LOGINS_BY_IP.pop(ip, None)
    return attempts


def _check_ip_rate_limit(ip: str, email_key: str = "") -> None:
    """Outer per-IP guard: bounds bulk brute force across emails.

    Runs before password verification, so unlike the per-key limit it also
    blocks correct passwords. See the module tradeoff comment above.
    """
    now = time.monotonic()
    attempts = _prune_ip_failures(ip, now)
    if len(attempts) >= _MAX_FAILED_LOGINS_PER_IP:
        oldest = min(attempts) if attempts else now
        retry_after = max(1, int(math.ceil(_LOGIN_WINDOW_SECONDS - (now - oldest))))
        _log_rate_limit_trip("per-ip", email_key, retry_after)
        raise HTTPException(
            status_code=429,
            detail="too many login attempts, try again later",
            headers={"Retry-After": str(retry_after)},
        )


def _prune_email_failures(email_key: str, now: float) -> list[float]:
    attempts = [t for t in _FAILED_LOGINS_BY_EMAIL.get(email_key, []) if now - t < _LOGIN_WINDOW_SECONDS]
    if attempts:
        _FAILED_LOGINS_BY_EMAIL[email_key] = attempts
    else:
        _FAILED_LOGINS_BY_EMAIL.pop(email_key, None)
    return attempts


def _check_email_rate_limit(email_key: str) -> None:
    """Outer email-only guard: bounds IP-rotating brute force against one email.

    Runs before password verification, so unlike the per-key limit it also
    blocks correct passwords. See the module tradeoff comment above.
    """
    now = time.monotonic()
    attempts = _prune_email_failures(email_key, now)
    if len(attempts) >= _MAX_FAILED_LOGINS_BY_EMAIL:
        oldest = min(attempts) if attempts else now
        retry_after = max(1, int(math.ceil(_LOGIN_WINDOW_SECONDS - (now - oldest))))
        _log_rate_limit_trip("per-email", email_key, retry_after)
        raise HTTPException(
            status_code=429,
            detail="too many login attempts, try again later",
            headers={"Retry-After": str(retry_after)},
        )


_LOOPBACK_PEERS = frozenset({"127.0.0.1", "::1"})


def _client_ip(request: Request | None) -> str:
    """Return the client IP for the per-IP login rate guard.

    Trust model (default-secure): X-Forwarded-For is a client-controlled
    header and trivially spoofable, so it is IGNORED by default — even from
    loopback peers — and the TCP peer IP (request.client.host) is used. Any
    local process could otherwise mint fresh rate-limit buckets with a
    spoofed leftmost entry. Direct-LAN/desktop behavior is unchanged: a
    non-loopback peer already ignores the header and uses the peer IP.

    Opt-in: the leftmost XFF entry is honored ONLY when ALL of these hold
    (env vars are read dynamically so tests can monkeypatch):

    - RESEARCH_TRUST_XFF=1 is set (explicit opt-in), AND
    - RESEARCH_IGNORE_XFF!=1 (legacy opt-out, kept for backward compat), AND
    - the TCP peer is loopback (127.0.0.1 / ::1), AND
    - the header is present and its leftmost entry is non-empty.

    Precedence: RESEARCH_IGNORE_XFF=1 always wins over RESEARCH_TRUST_XFF=1
    (trust requires TRUST==1 AND IGNORE!=1). With no header, or whenever any
    condition above fails, the peer IP is used as before ("unknown" when
    there is no request/peer).

    OPERATORS: set RESEARCH_TRUST_XFF=1 only when a same-host reverse proxy
    (nginx, Caddy, Traefik, ...) fronts the app AND you have verified the
    proxy overwrites X-Forwarded-For with the real client IP instead of
    appending to a client-supplied value. Otherwise leave the default (or
    set RESEARCH_IGNORE_XFF=1): every request is then keyed on the TCP peer
    (the proxy itself), so rate limiting stays effective. Direct-LAN
    deployments with no proxy are unaffected either way. There is no
    backend .env sample file to document this in (no backend/*.md or
    backend/.env* exists); this docstring is the home.

    SERVER-LAYER PAIRING (required for TRUST=1 to mean anything): this
    function only ever sees request.client as populated by the ASGI server.
    uvicorn's ProxyHeadersMiddleware (enabled by proxy_headers=True, which is
    uvicorn's installed default) rewrites scope["client"] from X-Forwarded-For
    for trusted peers BEFORE this code runs — so with proxy headers enabled,
    a spoofed header reaches here disguised as a non-loopback peer and the
    loopback check above cannot catch it. TRUST=1 therefore requires proxy
    headers to be enabled at the server layer to observe real client IPs, and
    proxy headers must be DISABLED everywhere TRUST is unset. Shipped matrix:

    - sidecar (backend/desktop.py): proxy_headers=False pinned explicitly +
      TRUST unset → every request keys on the TCP peer IP; XFF never honored.
    - dev CLI: run with --no-proxy-headers (the repo doc commands show a bare
      `uv run uvicorn api.main:app --reload`; that bare form inherits
      uvicorn's default True and must NOT be used as-is behind no proxy —
      always append --no-proxy-headers for direct local serving).
    - proxied deployments: enable proxy headers at the server layer (uvicorn
      --proxy-headers, plus --forwarded-allow-ips restricted to the proxy)
      AND set RESEARCH_TRUST_XFF=1, so the proxy-supplied XFF is what this
      function keys on. Without BOTH halves, buckets key on the proxy's peer
      IP (safe default) or on attacker-controlled input (misconfiguration).
    """
    peer: str | None = None
    if request is not None and request.client is not None:
        peer = request.client.host or None
    trust_xff = (
        os.environ.get("RESEARCH_TRUST_XFF") == "1"
        and os.environ.get("RESEARCH_IGNORE_XFF") != "1"
        and os.environ.get("RESEARCH_NATIVE_DESKTOP") != "1"
    )
    if not trust_xff:
        if peer:
            return peer
        return "unknown"
    if request is not None and peer in _LOOPBACK_PEERS:
        forwarded = request.headers.get("x-forwarded-for")
        if forwarded:
            first = forwarded.split(",")[0].strip()
            if first:
                return first
    if peer:
        return peer
    return "unknown"


def _rate_limit_key(request: Request | None, email: str) -> str:
    return f"{_client_ip(request)}|{email.strip().lower()}"


def _record_failed_login(key: str, ip: str | None = None, email_key: str | None = None) -> None:
    now = time.monotonic()
    attempts = _prune_failures(key, now)
    attempts.append(now)
    _FAILED_LOGINS[key] = attempts
    if ip is not None:
        ip_attempts = _prune_ip_failures(ip, now)
        ip_attempts.append(now)
        _FAILED_LOGINS_BY_IP[ip] = ip_attempts
    if email_key is not None:
        email_attempts = _prune_email_failures(email_key, now)
        email_attempts.append(now)
        _FAILED_LOGINS_BY_EMAIL[email_key] = email_attempts


def _public(user: User) -> UserPublic:
    return UserPublic(id=user.id, email=user.email)


def _verify_google_token(id_token: str) -> tuple[str, str]:
    """Hookable wrapper so tests can stub Google verification."""
    cid = client_id()
    if not cid:
        raise GoogleAuthError("Google login is not configured")
    return verify_google_id_token(id_token, cid)


def register(app: FastAPI) -> None:
    @app.post("/api/auth/register", status_code=201)
    def register_user(body: RegisterRequest, request: Request):
        ip = _client_ip(request)
        _check_register_rate_limit(ip)
        _record_register_attempt(ip)
        email = body.email.strip().lower()
        if not _EMAIL.match(email):
            raise HTTPException(status_code=400, detail="enter a valid email address")
        store = get_store(app)
        try:
            user = store.create_user(email, body.password)
        except ValueError:
            # Anti-enumeration: duplicate emails return HTTP 200 with a
            # non-committal body and NO session token (do not log anyone in).
            # Residual caveat (accepted): success is 201 + {user, token} while
            # duplicate is 200 + {registered, detail}, so the shape still
            # differs — full indistinguishability would break the legit signup
            # UX (the new user needs their token). Bulk enumeration is bounded
            # by the register throttle (20 attempts/hr per client IP, counted
            # before validation so duplicates consume the bucket as before).
            # Frontend contract: duplicate → 200 {registered: false,
            # detail: <string>}, no token; new → 201 with token as before.
            return JSONResponse(
                status_code=200,
                content={
                    "registered": False,
                    "detail": "An account with this email may already exist — try logging in instead.",
                },
            )
        token, _ = store.create_session(user.id)
        return JSONResponse(
            status_code=201,
            content={"user": {"id": user.id, "email": user.email}, "token": token},
        )

    @app.post("/api/auth/login", response_model=AuthResponse)
    def login(body: LoginRequest, request: Request):
        """Password login with three-layer rate limiting.

        Outer per-IP and email-only guards first (block even correct passwords
        past their thresholds), then verify-first per-key limit (a correct
        password clears its IP+email key and its email bucket — see module
        comment for why).
        """
        store = get_store(app)
        store.purge_expired_sessions()
        ip = _client_ip(request)
        email_key = body.email.strip().lower()
        _check_ip_rate_limit(ip, email_key)
        _check_email_rate_limit(email_key)
        key = _rate_limit_key(request, body.email)
        found = store.get_user_by_email(body.email)
        if found is not None and verify_password(body.password, found[1]):
            _FAILED_LOGINS.pop(key, None)
            _FAILED_LOGINS_BY_EMAIL.pop(email_key, None)
            token, _ = store.create_session(found[0].id)
            return AuthResponse(user=_public(found[0]), token=token)
        _check_rate_limit(key)
        _record_failed_login(key, ip, email_key)
        raise HTTPException(status_code=401, detail="wrong email or password")

    @app.post("/api/auth/logout", status_code=204)
    def logout(request: Request, user: User = Depends(get_current_user)):
        get_store(app).delete_session(request.headers.get("authorization", "")[7:])

    @app.get("/api/auth/me", response_model=UserPublic)
    def me(user: User = Depends(get_current_user)):
        return _public(user)

    @app.get("/api/me/progress")
    def me_progress(user: User = Depends(get_current_user)):
        """Onboarding checklist flags; per-user, false defaults, 401 anon."""
        return get_store(app).get_progress(user.id)

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
