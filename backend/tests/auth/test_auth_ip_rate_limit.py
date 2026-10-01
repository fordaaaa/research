"""Outer per-IP login guard: bulk failures across emails trip 429 with Retry-After."""
from __future__ import annotations


def _anon_client(data_dir, monkeypatch):
    monkeypatch.setenv("RESEARCH_DATA_DIR", str(data_dir))
    from fastapi.testclient import TestClient

    from api.main import app

    return TestClient(app)


def test_outer_ip_guard_triggers_across_emails(data_dir, monkeypatch):
    from api import auth as auth_module

    auth_module.reset_login_rate_limits()
    client = _anon_client(data_dir, monkeypatch)
    with client:
        client.post(
            "/api/auth/register",
            json={"email": "victim@example.com", "password": "password123"},
        )
        # 61 rapid failures spread across emails from same IP (TestClient IP)
        for i in range(61):
            client.post(
                "/api/auth/login",
                json={"email": f"user{i}@example.com", "password": "wrong-password"},
            )
        # 62nd attempt (even correct creds) must be 429 with Retry-After
        blocked = client.post(
            "/api/auth/login",
            json={"email": "victim@example.com", "password": "password123"},
        )
        assert blocked.status_code == 429
        assert "retry-after" in {k.lower() for k in blocked.headers.keys()}
    auth_module.reset_login_rate_limits()
