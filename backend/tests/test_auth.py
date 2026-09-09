from __future__ import annotations


def _anon_client(data_dir, monkeypatch):
    """Raw client with no token, for unauthenticated behavior."""
    monkeypatch.setenv("RESEARCH_DATA_DIR", str(data_dir))
    from fastapi.testclient import TestClient

    from api.main import app

    return TestClient(app)


def test_register_creates_user_and_token(client):
    # the authed fixture itself proves register works; check the shape here
    body = client.get("/api/auth/me").json()
    assert body["email"] == "student@example.com"
    assert "id" in body


def test_register_validates_email_and_password(data_dir, monkeypatch):
    client = _anon_client(data_dir, monkeypatch)
    with client:
        assert client.post(
            "/api/auth/register", json={"email": "not-an-email", "password": "password123"}
        ).status_code == 400
        assert client.post(
            "/api/auth/register", json={"email": "a@b.com", "password": "short"}
        ).status_code == 422
        assert client.post(
            "/api/auth/register",
            json={"email": "student@example.com", "password": "password123"},
        ).status_code == 201
        assert client.post(
            "/api/auth/register",
            json={"email": "STUDENT@example.com", "password": "password123"},
        ).status_code == 409


def test_login_round_trip_and_wrong_password(data_dir, monkeypatch):
    client = _anon_client(data_dir, monkeypatch)
    with client:
        client.post(
            "/api/auth/register",
            json={"email": "user@example.com", "password": "password123"},
        )
        good = client.post(
            "/api/auth/login",
            json={"email": "user@example.com", "password": "password123"},
        )
        assert good.status_code == 200
        assert good.json()["user"]["email"] == "user@example.com"
        token = good.json()["token"]
        assert client.get(
            "/api/notebooks", headers={"Authorization": f"Bearer {token}"}
        ).status_code == 200
        bad = client.post(
            "/api/auth/login",
            json={"email": "user@example.com", "password": "wrong-password"},
        )
        assert bad.status_code == 401
        assert client.post(
            "/api/auth/login",
            json={"email": "nobody@example.com", "password": "password123"},
        ).status_code == 401


def test_protected_routes_require_login(data_dir, monkeypatch):
    client = _anon_client(data_dir, monkeypatch)
    with client:
        assert client.get("/api/notebooks").status_code == 401
        assert client.post("/api/notebooks", json={"name": "x"}).status_code == 401
        assert client.get("/api/skills").status_code == 401
        assert client.post("/api/demo").status_code == 401
        assert client.get("/api/auth/me").status_code == 401
        assert client.post("/api/auth/logout").status_code == 401


def test_logout_invalidates_token(client):
    assert client.post("/api/auth/logout").status_code == 204
    assert client.get("/api/auth/me").status_code == 401
    assert client.get("/api/notebooks").status_code == 401


def test_users_cannot_see_each_others_data(data_dir, monkeypatch):
    first = _anon_client(data_dir, monkeypatch)
    with first:
        token_a = first.post(
            "/api/auth/register",
            json={"email": "a@example.com", "password": "password123"},
        ).json()["token"]
        token_b = first.post(
            "/api/auth/register",
            json={"email": "b@example.com", "password": "password123"},
        ).json()["token"]
        ha = {"Authorization": f"Bearer {token_a}"}
        hb = {"Authorization": f"Bearer {token_b}"}

        nb = first.post("/api/notebooks", json={"name": "A private"}, headers=ha).json()
        assert first.get("/api/notebooks", headers=hb).json() == []
        assert first.get(f"/api/notebooks/{nb['id']}/sources", headers=hb).status_code == 404
        assert first.get(f"/api/notebooks/{nb['id']}/export", headers=hb).status_code == 404
        assert first.delete(f"/api/notebooks/{nb['id']}", headers=hb).status_code == 404

        src = first.post(
            f"/api/notebooks/{nb['id']}/sources/text",
            json={"title": "Secret", "text": "A's words here."},
            headers=ha,
        ).json()
        assert first.get(f"/api/sources/{src['id']}", headers=hb).status_code == 404
        assert first.get(f"/api/sources/{src['id']}", headers=ha).status_code == 200

        skill = first.post(
            "/api/skills",
            json={"name": "Mine", "instructions": "Do things.", "triggers": []},
            headers=ha,
        ).json()
        assert first.get("/api/skills", headers=hb).json() == []
        assert first.get(f"/api/skills/{skill['id']}", headers=hb).status_code == 404


def test_passwords_are_hashed_at_rest(data_dir, monkeypatch):
    client = _anon_client(data_dir, monkeypatch)
    with client:
        client.post(
            "/api/auth/register",
            json={"email": "hash@example.com", "password": "password123"},
        )
    from core.store import Store

    store = Store(root=data_dir)
    found = store.get_user_by_email("hash@example.com")
    assert found is not None
    assert found[1] != "password123"
    assert found[1].startswith("pbkdf2$")
