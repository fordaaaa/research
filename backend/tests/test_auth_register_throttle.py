"""Per-IP register throttle: 20 POSTs/hour per client IP with Retry-After."""
from __future__ import annotations

import pytest


@pytest.fixture(autouse=True)
def _reset_limits():
    from api import auth as auth_module

    auth_module.reset_login_rate_limits()
    yield
    auth_module.reset_login_rate_limits()


def _anon_client(data_dir, monkeypatch):
    monkeypatch.setenv("RESEARCH_DATA_DIR", str(data_dir))
    from fastapi.testclient import TestClient

    from api.main import app

    return TestClient(app)


def test_r18_21st_rapid_register_blocked_with_retry_after(data_dir, monkeypatch):
    client = _anon_client(data_dir, monkeypatch)
    with client:
        for i in range(20):
            resp = client.post(
                "/api/auth/register",
                json={"email": f"bulk{i}@example.com", "password": "password123"},
            )
            assert resp.status_code == 201, resp.text
        blocked = client.post(
            "/api/auth/register",
            json={"email": "bulk20@example.com", "password": "password123"},
        )
        assert blocked.status_code == 429
        assert "retry-after" in {k.lower() for k in blocked.headers.keys()}


def test_r18_different_ip_unaffected_by_register_throttle(data_dir, monkeypatch):
    monkeypatch.setenv("RESEARCH_DATA_DIR", str(data_dir))
    from fastapi.testclient import TestClient

    from api.main import app

    with TestClient(app) as client:
        for i in range(20):
            resp = client.post(
                "/api/auth/register",
                json={"email": f"ipA{i}@example.com", "password": "password123"},
            )
            assert resp.status_code == 201, resp.text
        assert (
            client.post(
                "/api/auth/register",
                json={"email": "ipA20@example.com", "password": "password123"},
            ).status_code
            == 429
        )
        # Different peer IP gets a fresh bucket.
        other = TestClient(app, client=("198.51.100.77", 50000))
        with other:
            resp = other.post(
                "/api/auth/register",
                json={"email": "ipB0@example.com", "password": "password123"},
            )
            assert resp.status_code == 201, resp.text


def test_r18_reset_clears_register_buckets(data_dir, monkeypatch):
    from api import auth as auth_module

    client = _anon_client(data_dir, monkeypatch)
    with client:
        for i in range(20):
            assert (
                client.post(
                    "/api/auth/register",
                    json={"email": f"rst{i}@example.com", "password": "password123"},
                ).status_code
                == 201
            )
        assert (
            client.post(
                "/api/auth/register",
                json={"email": "rst20@example.com", "password": "password123"},
            ).status_code
            == 429
        )
        auth_module.reset_login_rate_limits()
        assert (
            client.post(
                "/api/auth/register",
                json={"email": "rst20@example.com", "password": "password123"},
            ).status_code
            == 201
        )
