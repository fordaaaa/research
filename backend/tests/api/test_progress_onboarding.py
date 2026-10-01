"""Onboarding progress flags: fresh/all-false, per-action flips, per-user, anon 401."""


def test_progress_fresh_user_all_false(client):
    r = client.get("/api/me/progress")
    assert r.status_code == 200, r.text
    assert r.json() == {
        "add_source": False,
        "search": False,
        "export": False,
        "review": False,
    }


def test_progress_each_action_flips_its_flag(client):
    nb = client.post("/api/notebooks", json={"name": "Progress"}).json()
    # paste -> add_source
    src = client.post(
        f"/api/notebooks/{nb['id']}/sources/text",
        json={"title": "Photosynthesis Notes", "text": "Photosynthesis drives plant growth."},
    ).json()
    assert client.get("/api/me/progress").json()["add_source"] is True
    # search (even 0 hits records; here 1 hit) -> search
    assert client.get(f"/api/notebooks/{nb['id']}/search", params={"q": "photosynthesis"}).status_code == 200
    assert client.get("/api/me/progress").json()["search"] is True
    # export -> export
    assert client.get(f"/api/notebooks/{nb['id']}/export").status_code == 200
    assert client.get("/api/me/progress").json()["export"] is True
    # grade -> review
    card = client.post(
        f"/api/notebooks/{nb['id']}/cards",
        json={"front": "Q?", "back": "A."},
    ).json()
    assert card["id"]
    rv = client.post(
        f"/api/notebooks/{nb['id']}/cards/{card['id']}/review",
        json={"rating": "good"},
    )
    assert rv.status_code == 200, rv.text
    assert client.get("/api/me/progress").json()["review"] is True
    _ = src  # silence lint


def test_progress_per_user_isolation(client):
    from fastapi.testclient import TestClient

    from api.main import app

    with TestClient(app) as other:
        reg = other.post(
            "/api/auth/register",
            json={"email": "progress-b@example.com", "password": "password123"},
        )
        assert reg.status_code == 201
        other.headers.update({"Authorization": f"Bearer {reg.json()['token']}"})
        assert other.get("/api/me/progress").json() == {
            "add_source": False,
            "search": False,
            "export": False,
            "review": False,
        }


def test_progress_anon_401():
    from fastapi.testclient import TestClient

    from api.main import app

    with TestClient(app):
        pass  # app fixture below uses client; use raw client here
    # Use a fresh raw TestClient without auth header
    from fastapi.testclient import TestClient as TC

    with TC(app) as anon:
        r = anon.get("/api/me/progress")
        assert r.status_code == 401
