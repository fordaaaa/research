"""Auth sessions: login purges expired sessions."""
from __future__ import annotations

import hashlib
from datetime import timedelta


def _anon_client(data_dir, monkeypatch):
    monkeypatch.setenv("RESEARCH_DATA_DIR", str(data_dir))
    from fastapi.testclient import TestClient

    from api.main import app

    return TestClient(app)


def test_login_purges_expired_sessions(data_dir, monkeypatch):
    from api import auth as auth_module

    if hasattr(auth_module, "reset_login_rate_limits"):
        auth_module.reset_login_rate_limits()
    client = _anon_client(data_dir, monkeypatch)
    with client:
        client.post(
            "/api/auth/register",
            json={"email": "purge@example.com", "password": "password123"},
        )
        from core.models import utcnow
        from core.store import Store

        store = Store(root=data_dir)
        found = store.get_user_by_email("purge@example.com")
        assert found is not None
        user = found[0]
        expired_at = (utcnow() - timedelta(days=1)).isoformat()
        with store._connect() as con:
            con.execute(
                "INSERT INTO sessions (token_hash, user_id, created_at, expires_at)"
                " VALUES (?, ?, ?, ?)",
                (
                    hashlib.sha256(b"dead-token").hexdigest(),
                    user.id,
                    expired_at,
                    expired_at,
                ),
            )
        with store._connect() as con:
            before = con.execute(
                "SELECT COUNT(*) AS n FROM sessions WHERE token_hash = ?",
                (hashlib.sha256(b"dead-token").hexdigest(),),
            ).fetchone()["n"]
        assert before == 1

        resp = client.post(
            "/api/auth/login",
            json={"email": "purge@example.com", "password": "password123"},
        )
        assert resp.status_code == 200
        with store._connect() as con:
            after = con.execute(
                "SELECT COUNT(*) AS n FROM sessions WHERE token_hash = ?",
                (hashlib.sha256(b"dead-token").hexdigest(),),
            ).fetchone()["n"]
        assert after == 0
