from __future__ import annotations

import pytest

from core.models import NoteCreate


def test_sessions_are_keyless_and_persist_messages(client, monkeypatch):
    nb = client.post("/api/notebooks", json={"name": "History"}).json()
    base = f"/api/notebooks/{nb['id']}/chat/sessions"

    created = client.post(base, json={}).json()
    assert created["title"] == "New conversation"
    assert created["notebook_id"] == nb["id"]
    assert client.get(base).json()[0]["id"] == created["id"]
    assert client.get(f"{base}/{created['id']}/messages").json() == []

    client.post(
        f"/api/notebooks/{nb['id']}/sources/text",
        json={"title": "Facts", "text": "The archive records a treaty."},
    )
    client.put("/api/settings/ai", json={"api_key": "long-enough-test-key", "model": "test-model"})
    from api import ai

    monkeypatch.setattr(ai.providers, "generate", lambda *args: ("The archive records a treaty. [1]", "used-model"))
    response = client.post(f"{base}/{created['id']}/messages", json={"message": "What is recorded?"})
    assert response.status_code == 200
    assistant = response.json()
    assert assistant["role"] == "assistant"
    assert assistant["model"] == "used-model"
    assert [message["role"] for message in client.get(f"{base}/{created['id']}/messages").json()] == ["user", "assistant"]
    assert client.get(base).json()[0]["title"] == "What is recorded?"


def test_session_history_is_readable_without_key_and_cross_session_is_404(client):
    nb = client.post("/api/notebooks", json={"name": "History"}).json()
    base = f"/api/notebooks/{nb['id']}/chat/sessions"
    session = client.post(base, json={"title": "Review"}).json()
    assert client.get(f"{base}/{session['id']}/messages").status_code == 200
    assert client.delete(f"{base}/{session['id']}").status_code == 204
    assert client.get(f"{base}/{session['id']}").status_code == 404
    assert client.get(f"{base}/{session['id']}/messages").status_code == 404


def test_note_create_defaults_body_and_rejects_blank_title():
    assert NoteCreate(title="A").body == ""
    with pytest.raises(ValueError):
        NoteCreate(title="   ")


def test_session_can_be_grounded_by_notebook_notes_without_sources(client, monkeypatch):
    nb = client.post("/api/notebooks", json={"name": "Notes only"}).json()
    client.post(
        f"/api/notebooks/{nb['id']}/notes",
        json={"title": "Lab observation", "body": "The sample changed from blue to green."},
    )
    session = client.post(f"/api/notebooks/{nb['id']}/chat/sessions", json={}).json()
    client.put("/api/settings/ai", json={"api_key": "long-enough-test-key", "model": "test-model"})
    from api import ai

    captured: dict[str, str] = {}

    def fake_generate(provider, key, model, prompt):
        captured["prompt"] = prompt
        return "The sample changed to green.", model

    monkeypatch.setattr(ai.providers, "generate", fake_generate)
    response = client.post(
        f"/api/notebooks/{nb['id']}/chat/sessions/{session['id']}/messages",
        json={"message": "What happened to the sample?"},
    )

    assert response.status_code == 200, response.text
    assert "Lab observation" in captured["prompt"]
    assert "changed from blue to green" in captured["prompt"]


def test_chat_messages_support_limit_and_before_cursor(client, monkeypatch):
    nb = client.post("/api/notebooks", json={"name": "Pages"}).json()
    base = f"/api/notebooks/{nb['id']}/chat/sessions"
    session = client.post(base, json={}).json()
    client.post(
        f"/api/notebooks/{nb['id']}/sources/text",
        json={"title": "Facts", "text": "The archive records a treaty."},
    )
    client.put("/api/settings/ai", json={"api_key": "long-enough-test-key", "model": "test-model"})
    from api import ai

    monkeypatch.setattr(ai.providers, "generate", lambda *args: ("The archive records a treaty. [1]", "used-model"))
    for n in range(3):
        assert client.post(f"{base}/{session['id']}/messages", json={"message": f"Question {n}"}).status_code == 200

    page = client.get(f"{base}/{session['id']}/messages", params={"limit": 2})
    assert page.status_code == 200
    tail = page.json()
    assert [m["text"] for m in tail] == ["Question 2", "The archive records a treaty. [1]"]

    older = client.get(
        f"{base}/{session['id']}/messages", params={"limit": 2, "before": tail[0]["id"]}
    )
    assert older.status_code == 200
    assert [m["text"] for m in older.json()] == ["Question 1", "The archive records a treaty. [1]"]

    empty = client.get(
        f"{base}/{session['id']}/messages", params={"limit": 2, "before": older.json()[0]["id"]}
    )
    assert [m["text"] for m in empty.json()] == ["Question 0", "The archive records a treaty. [1]"]
    assert (
        client.get(
            f"{base}/{session['id']}/messages", params={"limit": 2, "before": empty.json()[0]["id"]}
        ).json()
        == []
    )
    assert client.get(f"{base}/{session['id']}/messages", params={"limit": 0}).status_code == 422
