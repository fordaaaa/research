"""Email-only outer login rate bucket bounds XFF/IP rotation guessing."""
from __future__ import annotations

import pytest


@pytest.fixture(autouse=True)
def _reset_limits():
    from api import auth as auth_module

    auth_module.reset_login_rate_limits()
    yield
    auth_module.reset_login_rate_limits()


def _peer_client(peer):
    from fastapi.testclient import TestClient

    from api.main import app

    return TestClient(app, client=(peer, 50000))


def _post(peer, path, payload):
    return _peer_client(peer).post(path, json=payload)


def test_r9_email_bucket_caps_rotation_guessing(data_dir, monkeypatch):
    monkeypatch.setenv("RESEARCH_DATA_DIR", str(data_dir))
    from fastapi.testclient import TestClient

    from api.main import app

    with TestClient(app):
        _post("198.51.100.1", "/api/auth/register", {"email": "rot@example.com", "password": "password123"})
        for i in range(50):
            resp = _post(f"198.51.100.{i + 1}", "/api/auth/login", {"email": "rot@example.com", "password": "wrong-password"})
            assert resp.status_code == 401
        locked = _post("198.51.100.200", "/api/auth/login", {"email": "rot@example.com", "password": "password123"})
        assert locked.status_code == 429
        assert "retry-after" in {k.lower() for k in locked.headers.keys()}


def test_r9_correct_password_escapes_below_email_threshold(data_dir, monkeypatch):
    monkeypatch.setenv("RESEARCH_DATA_DIR", str(data_dir))
    from fastapi.testclient import TestClient

    from api.main import app

    with TestClient(app):
        _post("203.0.113.1", "/api/auth/register", {"email": "early@example.com", "password": "password123"})
        for i in range(49):
            _post(f"203.0.113.{i + 1}", "/api/auth/login", {"email": "early@example.com", "password": "wrong-password"})
        ok = _post("203.0.113.200", "/api/auth/login", {"email": "early@example.com", "password": "password123"})
        assert ok.status_code == 200


def test_r9_other_email_unaffected_by_bucket(data_dir, monkeypatch):
    monkeypatch.setenv("RESEARCH_DATA_DIR", str(data_dir))
    from fastapi.testclient import TestClient

    from api.main import app

    with TestClient(app):
        _post("192.0.2.1", "/api/auth/register", {"email": "other@example.com", "password": "password123"})
        ok = _post("192.0.2.2", "/api/auth/login", {"email": "other@example.com", "password": "password123"})
        assert ok.status_code == 200
