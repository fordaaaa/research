from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from api.main import create_app
import desktop


@pytest.fixture
def native_client(tmp_path, monkeypatch):
    monkeypatch.setenv("RESEARCH_NATIVE_DESKTOP", "1")
    monkeypatch.setenv("RESEARCH_DESKTOP_TOKEN", "native-launch-secret")
    monkeypatch.setenv("RESEARCH_DATA_DIR", str(tmp_path / "data"))
    with TestClient(create_app(), client=("127.0.0.1", 12345)) as client:
        yield client


def test_native_header_required_even_with_legacy_cookie(native_client):
    assert native_client.get("/api/health").status_code == 200
    assert native_client.get("/api/notebooks").status_code == 403
    native_client.cookies.set("research_session", "native-launch-secret")
    assert native_client.get("/api/notebooks").status_code == 403
    assert native_client.get("/api/notebooks", headers={"X-Notaeo-Desktop-Token": "wrong"}).status_code == 403
    assert native_client.get("/api/notebooks", headers={"X-Notaeo-Desktop-Token": "native-launch-secret"}).status_code == 401


def test_native_bundle_has_no_browser_docs_and_guards_runtime(native_client):
    for path in ("/docs", "/redoc", "/openapi.json"):
        assert native_client.get(path).status_code == 404
    denied = native_client.get("/api/runtime")
    assert denied.status_code == 403
    assert denied.headers["x-content-type-options"] == "nosniff"
    assert denied.headers["x-frame-options"] == "DENY"
    runtime = native_client.get("/api/runtime", headers={"X-Notaeo-Desktop-Token": "native-launch-secret"})
    assert runtime.status_code == 200
    assert runtime.json()["desktop_session_required"] is True


def test_native_token_preserves_account_ownership_and_has_no_browser_exchange(native_client):
    launch = {"X-Notaeo-Desktop-Token": "native-launch-secret"}
    first = native_client.post("/api/auth/register", headers=launch, json={"email": "native@example.com", "password": "password123"})
    assert first.status_code == 201
    own = {**launch, "Authorization": f"Bearer {first.json()['token']}"}
    notebook = native_client.post("/api/notebooks", headers=own, json={"name": "Exam revision"})
    assert notebook.status_code == 201
    second = native_client.post("/api/auth/register", headers=launch, json={"email": "other@example.com", "password": "password123"})
    other = {**launch, "Authorization": f"Bearer {second.json()['token']}"}
    assert native_client.get(f"/api/notebooks/{notebook.json()['id']}", headers=other).status_code == 404
    assert native_client.get("/api/notebooks", headers={"Authorization": own["Authorization"]}).status_code == 403
    root = native_client.get("/?desktop_token=native-launch-secret", follow_redirects=False)
    assert root.status_code == 404
    assert "set-cookie" not in root.headers


def test_native_sidecar_starts_without_frontend_assets(tmp_path, monkeypatch):
    monkeypatch.setenv("RESEARCH_NATIVE_DESKTOP", "1")
    monkeypatch.setenv("RESEARCH_DESKTOP_TOKEN", "native-launch-secret")
    monkeypatch.setenv("RESEARCH_WEB_DIR", str(tmp_path / "missing-web"))
    monkeypatch.setenv("RESEARCH_DATA_DIR", str(tmp_path / "data"))
    with TestClient(desktop.create_desktop_app()) as client:
        assert client.get("/api/health").status_code == 200
        assert client.get("/").status_code == 404
        assert client.get("/index.html").status_code == 404


def test_native_mode_refuses_missing_launch_token(monkeypatch):
    monkeypatch.setenv("RESEARCH_NATIVE_DESKTOP", "1")
    monkeypatch.delenv("RESEARCH_DESKTOP_TOKEN", raising=False)
    with pytest.raises(RuntimeError, match="RESEARCH_DESKTOP_TOKEN"):
        create_app()


def test_packaged_native_mode_requires_external_data_directory(monkeypatch, tmp_path):
    monkeypatch.setenv("RESEARCH_NATIVE_DESKTOP", "1")
    monkeypatch.setenv("RESEARCH_DESKTOP_TOKEN", "launch")
    monkeypatch.delenv("RESEARCH_DATA_DIR", raising=False)
    with pytest.raises(RuntimeError, match="RESEARCH_DATA_DIR"):
        desktop.create_desktop_app()
    bundle = tmp_path / "Notaeo.app"
    monkeypatch.setattr(desktop.sys, "frozen", True, raising=False)
    monkeypatch.setattr(desktop.sys, "executable", str(bundle / "Contents/Resources/backend/research-backend"))
    monkeypatch.setenv("RESEARCH_DATA_DIR", str(bundle / "Contents/Resources/data"))
    with pytest.raises(RuntimeError, match="outside"):
        desktop.create_desktop_app()


def test_native_login_cannot_rotate_forwarded_ip_buckets(native_client, monkeypatch):
    monkeypatch.setenv("RESEARCH_TRUST_XFF", "1")
    monkeypatch.delenv("RESEARCH_IGNORE_XFF", raising=False)
    native_client.headers["X-Notaeo-Desktop-Token"] = "native-launch-secret"
    assert native_client.post("/api/auth/register", json={"email": "rate@example.com", "password": "password123"}).status_code == 201
    for index in range(10):
        response = native_client.post("/api/auth/login", headers={"X-Forwarded-For": f"192.0.2.{index}"}, json={"email": "rate@example.com", "password": "wrong-password"})
        assert response.status_code == 401
    assert native_client.post("/api/auth/login", headers={"X-Forwarded-For": "198.51.100.1"}, json={"email": "rate@example.com", "password": "wrong-password"}).status_code == 429
