from __future__ import annotations

from pathlib import Path

import pytest


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
