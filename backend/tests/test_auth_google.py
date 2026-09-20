from __future__ import annotations


def _anon_client(data_dir, monkeypatch):
    monkeypatch.setenv("RESEARCH_DATA_DIR", str(data_dir))
    monkeypatch.delenv("GOOGLE_CLIENT_ID", raising=False)
    from fastapi.testclient import TestClient

    from api.main import app

    return TestClient(app)


def test_google_status_disabled_without_client_id(data_dir, monkeypatch):
    client = _anon_client(data_dir, monkeypatch)
    with client:
        res = client.get("/api/auth/google/status")
        assert res.status_code == 200
        body = res.json()
        assert body["enabled"] is False


def test_google_status_enabled_with_client_id(data_dir, monkeypatch):
    monkeypatch.setenv("RESEARCH_DATA_DIR", str(data_dir))
    monkeypatch.setenv("GOOGLE_CLIENT_ID", "test-client-id.apps.googleusercontent.com")
    from fastapi.testclient import TestClient

    from api.main import app

    with TestClient(app) as client:
        res = client.get("/api/auth/google/status")
        assert res.status_code == 200
        body = res.json()
        assert body["enabled"] is True
        assert body["client_id"] == "test-client-id.apps.googleusercontent.com"


def test_google_login_creates_user_and_reuses_sub(data_dir, monkeypatch):
    import api.auth as auth_module

    monkeypatch.setenv("RESEARCH_DATA_DIR", str(data_dir))
    monkeypatch.setenv("GOOGLE_CLIENT_ID", "test-client-id.apps.googleusercontent.com")
    monkeypatch.setattr(
        auth_module, "_verify_google_token", lambda token: ("guser@example.com", "google-sub-1")
    )
    from fastapi.testclient import TestClient

    from api.main import app

    with TestClient(app) as client:
        first = client.post("/api/auth/google", json={"id_token": "valid-token"})
        assert first.status_code == 200
        user_id = first.json()["user"]["id"]
        token = first.json()["token"]
        assert first.json()["user"]["email"] == "guser@example.com"
        me = client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})
        assert me.status_code == 200

        second = client.post("/api/auth/google", json={"id_token": "another-token"})
        assert second.status_code == 200
        assert second.json()["user"]["id"] == user_id


def test_google_login_links_existing_email_user(data_dir, monkeypatch):
    import api.auth as auth_module

    monkeypatch.setenv("RESEARCH_DATA_DIR", str(data_dir))
    monkeypatch.setenv("GOOGLE_CLIENT_ID", "test-client-id.apps.googleusercontent.com")
    monkeypatch.setattr(
        auth_module, "_verify_google_token", lambda token: ("student@example.com", "google-sub-9")
    )
    from fastapi.testclient import TestClient

    from api.main import app

    with TestClient(app) as anon:
        assert anon.post(
            "/api/auth/register",
            json={"email": "student@example.com", "password": "password123"},
        ).status_code == 201
        res = anon.post("/api/auth/google", json={"id_token": "valid-token"})
        assert res.status_code == 200
        assert res.json()["user"]["email"] == "student@example.com"


def test_google_login_rejects_invalid_token(data_dir, monkeypatch):
    import api.auth as auth_module
    from core.google_auth import GoogleAuthError

    def _bad(token: str):
        raise GoogleAuthError("invalid Google token")

    monkeypatch.setenv("RESEARCH_DATA_DIR", str(data_dir))
    monkeypatch.setenv("GOOGLE_CLIENT_ID", "test-client-id.apps.googleusercontent.com")
    monkeypatch.setattr(auth_module, "_verify_google_token", _bad)
    from fastapi.testclient import TestClient

    from api.main import app

    with TestClient(app) as client:
        res = client.post("/api/auth/google", json={"id_token": "bad-token-12345"})
        assert res.status_code == 401


def test_google_login_503_without_client_id(data_dir, monkeypatch):
    client = _anon_client(data_dir, monkeypatch)
    with client:
        res = client.post("/api/auth/google", json={"id_token": "anything-12345"})
        assert res.status_code == 503
