"""Per-key login rate limit: 10 failures / 5min per IP+email, verify-first escape."""
from __future__ import annotations

import pytest


@pytest.fixture(autouse=True)
def _reset_limits():
    from api import auth as auth_module

    if hasattr(auth_module, "reset_login_rate_limits"):
        auth_module.reset_login_rate_limits()
    yield
    if hasattr(auth_module, "reset_login_rate_limits"):
        auth_module.reset_login_rate_limits()


def _anon_client(data_dir, monkeypatch):
    monkeypatch.setenv("RESEARCH_DATA_DIR", str(data_dir))
    from fastapi.testclient import TestClient

    from api.main import app

    return TestClient(app)


def test_r2_rate_limit_429_with_retry_after(data_dir, monkeypatch):
    client = _anon_client(data_dir, monkeypatch)
    with client:
        client.post(
            "/api/auth/register",
            json={"email": "victim@example.com", "password": "password123"},
        )
        for _ in range(10):
            resp = client.post(
                "/api/auth/login",
                json={"email": "victim@example.com", "password": "wrong-password"},
            )
            assert resp.status_code == 401
            assert resp.json()["detail"] == "wrong email or password"
        blocked = client.post(
            "/api/auth/login",
            json={"email": "victim@example.com", "password": "wrong-password"},
        )
        assert blocked.status_code == 429
        assert "retry-after" in {k.lower() for k in blocked.headers.keys()}


def test_r2_correct_password_beats_rate_limit(data_dir, monkeypatch):
    client = _anon_client(data_dir, monkeypatch)
    with client:
        client.post(
            "/api/auth/register",
            json={"email": "victim2@example.com", "password": "password123"},
        )
        for _ in range(10):
            client.post(
                "/api/auth/login",
                json={"email": "victim2@example.com", "password": "wrong-password"},
            )
        ok = client.post(
            "/api/auth/login",
            json={"email": "victim2@example.com", "password": "password123"},
        )
        assert ok.status_code == 200
        # window cleared: a subsequent wrong password is 401, not 429
        again = client.post(
            "/api/auth/login",
            json={"email": "victim2@example.com", "password": "wrong-password"},
        )
        assert again.status_code == 401


def test_r2_different_email_unaffected(data_dir, monkeypatch):
    client = _anon_client(data_dir, monkeypatch)
    with client:
        client.post(
            "/api/auth/register",
            json={"email": "victim3@example.com", "password": "password123"},
        )
        client.post(
            "/api/auth/register",
            json={"email": "other3@example.com", "password": "password123"},
        )
        for _ in range(10):
            client.post(
                "/api/auth/login",
                json={"email": "victim3@example.com", "password": "wrong-password"},
            )
        ok = client.post(
            "/api/auth/login",
            json={"email": "other3@example.com", "password": "password123"},
        )
        assert ok.status_code == 200
