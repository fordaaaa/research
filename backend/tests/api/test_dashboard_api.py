"""GET /api/me/dashboard: due aggregation, streak, calendar, ownership."""
from fastapi.testclient import TestClient

from api.main import app

def _other_user(email: str) -> TestClient:
    """Register a second user and return an authed client for them."""
    with TestClient(app) as anon:
        token = anon.post(
            "/api/auth/register", json={"email": email, "password": "password123"}
    ).json()["token"]
    return TestClient(app, headers={"Authorization": f"Bearer {token}"})




def _notebook(client: TestClient, name: str = "Bio") -> str:
    return client.post("/api/notebooks", json={"name": name}).json()["id"]


def _card(client: TestClient, notebook_id: str, front: str = "Front") -> str:
    return client.post(
        f"/api/notebooks/{notebook_id}/cards",
        json={"front": front, "back": "Back"},
    ).json()["id"]


def test_empty_dashboard_is_all_zero(client: TestClient):
    response = client.get("/api/me/dashboard")
    assert response.status_code == 200
    body = response.json()
    assert body["due_total"] == 0
    assert body["due_by_notebook"] == []
    assert body["streak"]["current"] == 0
    assert body["streak"]["reviewed_today"] is False
    assert body["recent_notes"] == [] and body["recent_sources"] == []
    assert len(body["calendar"]) == 35


def test_due_total_and_streak_after_review(client: TestClient):
    notebook_id = _notebook(client)
    card_id = _card(client, notebook_id)

    body = client.get("/api/me/dashboard").json()
    assert body["due_total"] == 1
    assert body["due_by_notebook"][0]["notebook_name"] == "Bio"
    assert body["streak"]["reviewed_today"] is False

    graded = client.post(f"/api/me/cards/{card_id}/review", json={"rating": "good"})
    assert graded.status_code == 200

    body = client.get("/api/me/dashboard").json()
    assert body["due_total"] == 0
    assert body["streak"]["current"] == 1
    assert body["streak"]["reviewed_today"] is True
    # a "good" grade schedules +2 days: the calendar must show it, not today
    assert body["calendar"][0]["card_due"] == []
    later = [day for day in body["calendar"] if day["card_due"]]
    assert len(later) == 1 and later[0]["card_due"][0]["count"] == 1


def test_dashboard_is_user_scoped(client: TestClient):
    notebook_id = _notebook(client)
    _card(client, notebook_id)
    other = _other_user("other-dash@example.com")
    body = other.get("/api/me/dashboard").json()
    assert body["due_total"] == 0
    assert body["due_by_notebook"] == []


def test_recent_notes_and_sources_appear(client: TestClient):
    notebook_id = _notebook(client)
    client.post(
        f"/api/notebooks/{notebook_id}/sources/text",
        json={"title": "Lecture 1", "text": "Mitochondria produce ATP. " * 40},
    )
    client.post(
        f"/api/notebooks/{notebook_id}/notes",
        json={"title": "Key idea", "body": "ATP is the energy currency."},
    )
    body = client.get("/api/me/dashboard").json()
    assert [s["title"] for s in body["recent_sources"]] == ["Lecture 1"]
    assert body["recent_sources"][0]["notebook_name"] == "Bio"
    assert [n["title"] for n in body["recent_notes"]] == ["Key idea"]
