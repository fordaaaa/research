"""Cross-notebook review queue: one due queue across all of a user's notebooks."""
from fastapi.testclient import TestClient

from api.main import app

def _other_user(email: str) -> TestClient:
    """Register a second user and return an authed client for them."""
    with TestClient(app) as anon:
        token = anon.post(
            "/api/auth/register", json={"email": email, "password": "password123"}
    ).json()["token"]
    return TestClient(app, headers={"Authorization": f"Bearer {token}"})




def _notebook_with_card(client: TestClient, name: str, front: str) -> str:
    notebook_id = client.post("/api/notebooks", json={"name": name}).json()["id"]
    client.post(
        f"/api/notebooks/{notebook_id}/cards", json={"front": front, "back": "back"}
    )
    return notebook_id


def test_queue_spans_notebooks_and_shows_names(client: TestClient):
    _notebook_with_card(client, "Biology", "What is ATP?")
    _notebook_with_card(client, "History", "Year of the Berlin Wall?")

    queue = client.get("/api/me/review-queue").json()
    assert sorted(item["card"]["front"] for item in queue) == [
        "What is ATP?", "Year of the Berlin Wall?",
    ]
    assert {item["notebook_name"] for item in queue} == {"Biology", "History"}


def test_grading_user_card_schedules_and_records_streak(client: TestClient):
    notebook_id = _notebook_with_card(client, "Biology", "Q1")
    card_id = client.get("/api/me/review-queue").json()[0]["card"]["id"]

    graded = client.post(f"/api/me/cards/{card_id}/review", json={"rating": "good"})
    assert graded.status_code == 200
    assert graded.json()["card"]["interval_days"] == 2.0
    assert graded.json()["notebook_id"] == notebook_id

    # graded "good" leaves the queue; streak lands on the dashboard
    remaining = client.get("/api/me/review-queue").json()
    assert remaining == []
    streak = client.get("/api/me/dashboard").json()["streak"]
    assert streak["current"] == 1 and streak["reviewed_today"] is True


def test_notebook_scoped_and_user_scoped_grading_agree(client: TestClient):
    notebook_id = _notebook_with_card(client, "Biology", "Q1")
    card_id = client.get("/api/me/review-queue").json()[0]["card"]["id"]
    client.post(f"/api/me/cards/{card_id}/review", json={"rating": "easy"})
    scheduled = client.get(f"/api/notebooks/{notebook_id}/cards").json()[0]
    assert scheduled["interval_days"] == 4.0
    assert scheduled["last_reviewed_at"] is not None


def test_foreign_card_is_404(client: TestClient):
    _notebook_with_card(client, "Biology", "mine")
    card_id = client.get("/api/me/review-queue").json()[0]["card"]["id"]
    other = _other_user("other-review@example.com")
    assert other.post(
        f"/api/me/cards/{card_id}/review", json={"rating": "good"}
    ).status_code == 404
    assert other.get("/api/me/review-queue").json() == []


def test_bad_rating_is_422(client: TestClient):
    _notebook_with_card(client, "Biology", "Q1")
    card_id = client.get("/api/me/review-queue").json()[0]["card"]["id"]
    assert client.post(
        f"/api/me/cards/{card_id}/review", json={"rating": "kinda"}
    ).status_code == 422
