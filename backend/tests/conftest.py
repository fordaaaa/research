from __future__ import annotations

from pathlib import Path

import pytest


@pytest.fixture(autouse=True)
def _reset_auth_rate_limits():
    """Clear login + register buckets around every test.

    Register throttle is 20/hour per client IP and the TestClient peer is
    shared across tests, so without this the suite's hundreds of registers
    would trip the guard. reset_login_rate_limits() also clears the
    register buckets.
    """
    from api import auth as auth_module

    if hasattr(auth_module, "reset_login_rate_limits"):
        auth_module.reset_login_rate_limits()
    yield
    if hasattr(auth_module, "reset_login_rate_limits"):
        auth_module.reset_login_rate_limits()


@pytest.fixture()
def data_dir(tmp_path: Path) -> Path:
    return tmp_path / "data"


@pytest.fixture()
def client(data_dir: Path, monkeypatch: pytest.MonkeyPatch):
    """Authed client: registers one user per test and sends its bearer token.

    Every product route requires login, so the default fixture logs in. Use a
    raw TestClient (see test_auth.py) for unauthenticated behavior.
    """
    monkeypatch.setenv("RESEARCH_DATA_DIR", str(data_dir))
    from fastapi.testclient import TestClient

    from api.main import app

    with TestClient(app) as anon:
        response = anon.post(
            "/api/auth/register",
            json={"email": "student@example.com", "password": "password123"},
        )
        assert response.status_code == 201
        token = response.json()["token"]
    with TestClient(app, headers={"Authorization": f"Bearer {token}"}) as authed:
        yield authed
