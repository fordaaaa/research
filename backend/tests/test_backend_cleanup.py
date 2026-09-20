"""Cleanup-owner regressions: validation and prompt bounds.

These tests were added before the fix (failing-first) and must stay green.
"""
from __future__ import annotations


def test_note_update_rejects_blank_title(client):
    nb = client.post("/api/notebooks", json={"name": "Notes"}).json()
    note = client.post(
        f"/api/notebooks/{nb['id']}/notes", json={"title": "Keep", "body": "x"}
    ).json()
    response = client.patch(
        f"/api/notebooks/{nb['id']}/notes/{note['id']}",
        json={"base_rev": 1, "title": "   "},
    )
    assert response.status_code == 422


def test_session_message_bounds_history_prompt(client, monkeypatch):
    nb = client.post("/api/notebooks", json={"name": "History bounds"}).json()
    client.post(
        f"/api/notebooks/{nb['id']}/sources/text",
        json={"title": "Facts", "text": "The archive records a treaty."},
    )
    session = client.post(
        f"/api/notebooks/{nb['id']}/chat/sessions", json={}
    ).json()
    client.put(
        "/api/settings/ai",
        json={"api_key": "long-enough-test-key", "model": "test-model"},
    )
    from api import ai

    captured: dict[str, str] = {}

    def fake_generate(provider, key, model, prompt):
        captured["prompt"] = prompt
        return "ok", model

    monkeypatch.setattr(ai.providers, "generate", fake_generate)
    long_question = "q" * 4000
    for _ in range(5):
        response = client.post(
            f"/api/notebooks/{nb['id']}/chat/sessions/{session['id']}/messages",
            json={"message": long_question},
        )
        assert response.status_code == 200, response.text
    prompt = captured["prompt"]
    # History is the last 8 messages; without a bound this prompt exceeds ~20k
    # chars (4k user x4 in history alone). The bound keeps the full prompt
    # well under that.
    assert len(prompt) < 15000
    assert "RECENT CHAT:" in prompt
