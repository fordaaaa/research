"""Google Classroom: config gating, state binding, sync mapping (canned HTTP)."""
import httpx
import pytest
from fastapi.testclient import TestClient

from api.main import app
from core import classroom

ENV = {
    "GOOGLE_CLIENT_ID": "test-client-id.apps.googleusercontent.com",
    "GOOGLE_CLIENT_SECRET": "test-secret",
    "RESEARCH_PUBLIC_BASE_URL": "https://notaeo.example",
}

COURSES = {"courses": [{"id": "crs-1", "name": "AP Biology"}]}
COURSEWORK = {
    "courseWork": [
        {"id": "cw-1", "title": "Cell test", "description": "ch. 1-4",
         "dueDate": {"year": 2026, "month": 10, "day": 15},
         "dueTime": {"hours": 23, "minutes": 59}},
        {"id": "cw-2", "title": "Reading (no due date)"},
    ]
}


def _google_transport() -> httpx.MockTransport:
    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.host == "oauth2.googleapis.com":
            return httpx.Response(200, json={
                "access_token": "ya29.fresh", "refresh_token": "1//refresh",
                "expires_in": 3600,
            })
        if request.url.host == "classroom.googleapis.com":
            if request.url.path == "/v1/courses":
                return httpx.Response(200, json=COURSES)
            if request.url.path == "/v1/courses/crs-1/courseWork":
                return httpx.Response(200, json=COURSEWORK)
        return httpx.Response(404, json={"error": "unmocked " + request.url.path})

    return httpx.MockTransport(handler)


def _mock_http(monkeypatch: pytest.MonkeyPatch) -> None:
    """Route api.classroom's httpx.Client through canned Google responses."""
    real_client = httpx.Client
    monkeypatch.setattr(
        "api.classroom.httpx.Client",
        lambda **kw: real_client(transport=_google_transport()),
    )


@pytest.fixture()
def configured(monkeypatch: pytest.MonkeyPatch):
    for key, value in ENV.items():
        monkeypatch.setenv(key, value)
    yield


def test_parse_due_combines_date_and_time():
    due = classroom.parse_due(COURSEWORK["courseWork"][0])
    assert due is not None and due.year == 2026 and due.minute == 59
    assert classroom.parse_due(COURSEWORK["courseWork"][1]) is None
    assert classroom.parse_due({"dueDate": {"year": "x"}}) is None


def test_status_and_gates_without_config(client: TestClient):
    status = client.get("/api/classroom/status").json()
    assert status["enabled"] is False and status["connected"] is False
    assert status["reason"] and "not configured" in status["reason"]
    assert client.get("/api/classroom/authorize").status_code == 503
    assert client.post("/api/classroom/sync").status_code == 503


def test_authorize_redirect_carries_bound_state(
    client: TestClient, configured: None
):
    response = client.get("/api/classroom/authorize")
    assert response.status_code == 200
    url = response.json()["authorize_url"]
    assert url.startswith("https://accounts.google.com/o/oauth2/v2/auth?")
    assert "classroom.courses.readonly" in url
    assert "state=" in url


def test_callback_rejects_bad_state(
    client: TestClient, configured: None, monkeypatch: pytest.MonkeyPatch
):
    _mock_http(monkeypatch)
    response = client.get(
        "/api/classroom/callback?code=abc&state=not-a-valid-state",
        follow_redirects=False,
    )
    assert response.status_code == 400
    assert client.get("/api/classroom/status").json()["connected"] is False


def test_callback_exchanges_and_stores_tokens(
    client: TestClient, configured: None, monkeypatch: pytest.MonkeyPatch
):
    _mock_http(monkeypatch)
    state = client.get("/api/classroom/authorize").json()["authorize_url"].split("state=")[1].split("&")[0]
    response = client.get(
        f"/api/classroom/callback?code=abc&state={state}", follow_redirects=False
    )
    assert response.status_code in (302, 307)
    assert response.headers["location"] == "/?classroom=connected"
    status = client.get("/api/classroom/status").json()
    assert status["connected"] is True and status["enabled"] is True


def test_sync_maps_courses_and_coursework_idempotently(
    client: TestClient, configured: None, monkeypatch: pytest.MonkeyPatch
):
    _mock_http(monkeypatch)
    state = client.get("/api/classroom/authorize").json()["authorize_url"].split("state=")[1].split("&")[0]
    client.get(f"/api/classroom/callback?code=abc&state={state}")

    first = client.post("/api/classroom/sync")
    assert first.status_code == 200
    body = first.json()
    assert body == {"classes_synced": 1, "assignments_synced": 1, "assignments_skipped": 1}

    listed = client.get("/api/assignments").json()
    assert [a["title"] for a in listed] == ["Cell test"]
    assert listed[0]["source"] == "google_classroom"
    assert listed[0]["class_name"] == "AP Biology"
    assert listed[0]["due_at"].startswith("2026-10-15T23:59")

    # a second sync must refresh in place, not duplicate
    second = client.post("/api/classroom/sync").json()
    assert second == {"classes_synced": 1, "assignments_synced": 0, "assignments_skipped": 1}
    assert len(client.get("/api/assignments").json()) == 1


def test_disconnect_clears_connection(
    client: TestClient, configured: None, monkeypatch: pytest.MonkeyPatch
):
    _mock_http(monkeypatch)
    state = client.get("/api/classroom/authorize").json()["authorize_url"].split("state=")[1].split("&")[0]
    client.get(f"/api/classroom/callback?code=abc&state={state}")
    assert client.delete("/api/classroom/connection").status_code == 204
    assert client.get("/api/classroom/status").json()["connected"] is False
    assert client.post("/api/classroom/sync").status_code == 400
