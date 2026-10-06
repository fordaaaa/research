"""Chat grounding regressions: both chat routes must surface late evidence.

Sequential context fills the 14k budget from the oldest chunks, so a late
source is invisible to the prompt. Query-aware context must include it for
both POST /chat and POST /chat/sessions/{id}/messages while preserving
notes/memory/history and never leaking the provider key.
"""
from __future__ import annotations

from api import ai as ai_api
from core.store import Store

FILLER_ONE = "Filler one lorem ipsum dolor sit amet consectetur adipiscing elit alpha. " * 150
FILLER_TWO = "Filler two lorem ipsum dolor sit amet consectetur adipiscing elit beta. " * 150
LATE_MARKER = "ZEPHYR_QUANTUM_PHOTOSYNTHESIS_MARKER"
LATE_TEXT = (
    f"Late discovery details {LATE_MARKER} quantum photosynthesis breakthrough zephyr unfolding. " * 20
)
QUESTION = "What is zephyr quantum photosynthesis breakthrough?"


def _notebook_with_filler_then_late(client):
    nb = client.post("/api/notebooks", json={"name": "Grounding"}).json()
    client.post(
        f"/api/notebooks/{nb['id']}/sources/text",
        json={"title": "Filler One", "text": FILLER_ONE},
    )
    client.post(
        f"/api/notebooks/{nb['id']}/sources/text",
        json={"title": "Filler Two", "text": FILLER_TWO},
    )
    late = client.post(
        f"/api/notebooks/{nb['id']}/sources/text",
        json={"title": "Late Discovery", "text": LATE_TEXT},
    ).json()
    return nb, late


def _enable_ai(client):
    client.put(
        "/api/settings/ai",
        json={"api_key": "long-enough-test-key-12345", "model": "test-model"},
    )


def test_chat_grounding_includes_late_source_without_key_leak(client, monkeypatch):
    nb, late = _notebook_with_filler_then_late(client)
    client.put(
        f"/api/notebooks/{nb['id']}/memory",
        json={"notes": "midterm covers quantum photosynthesis"},
    )
    _enable_ai(client)
    # Full hydration must never happen on the chat path.
    monkeypatch.setattr(
        Store, "get_source", lambda *args, **kwargs: (_ for _ in ()).throw(
            AssertionError("full source hydration must not happen")
        ),
    )
    captured: dict[str, object] = {}

    def fake_generate(provider, key, model, prompt):
        captured["provider"] = provider
        captured["key"] = key
        captured["model"] = model
        captured["prompt"] = prompt
        return ("Late discovery answer [3].", model)

    monkeypatch.setattr(ai_api.providers, "generate", fake_generate)
    response = client.post(f"/api/notebooks/{nb['id']}/chat", json={"message": QUESTION})
    assert response.status_code == 200, response.text
    prompt = captured["prompt"]
    assert isinstance(prompt, str)
    # Late-source evidence reaches the model despite being past the sequential budget.
    assert LATE_MARKER in prompt
    assert "Late Discovery" in prompt
    # Memory notes still preserved alongside sources.
    assert "midterm covers quantum photosynthesis" in prompt
    # Provider key is used for the call but never pasted into the prompt.
    assert captured["key"] == "long-enough-test-key-12345"
    assert "long-enough-test-key-12345" not in prompt
    # Citations still point at the late source with 1:1 numbering.
    citations = response.json()["citations"]
    assert any(c["source_id"] == late["id"] for c in citations)


def test_session_message_grounding_preserves_notes_and_history(client, monkeypatch):
    nb, late = _notebook_with_filler_then_late(client)
    client.post(
        f"/api/notebooks/{nb['id']}/notes",
        json={"title": "Lab observation", "body": "The sample changed from blue to green."},
    )
    client.put(
        f"/api/notebooks/{nb['id']}/memory",
        json={"notes": "remember zephyr review focus"},
    )
    session = client.post(f"/api/notebooks/{nb['id']}/chat/sessions", json={}).json()
    _enable_ai(client)
    monkeypatch.setattr(
        Store, "get_source", lambda *args, **kwargs: (_ for _ in ()).throw(
            AssertionError("full source hydration must not happen")
        ),
    )
    prompts: list[str] = []
    keys: list[str] = []

    def fake_generate(provider, key, model, prompt):
        prompts.append(prompt)
        keys.append(key)
        return ("Acknowledged.", model)

    monkeypatch.setattr(ai_api.providers, "generate", fake_generate)
    first = client.post(
        f"/api/notebooks/{nb['id']}/chat/sessions/{session['id']}/messages",
        json={"message": "First hello about filler"},
    )
    assert first.status_code == 200, first.text
    second = client.post(
        f"/api/notebooks/{nb['id']}/chat/sessions/{session['id']}/messages",
        json={"message": QUESTION},
    )
    assert second.status_code == 200, second.text
    assert len(prompts) == 2
    late_prompt = prompts[1]
    # Late evidence present on the session path too.
    assert LATE_MARKER in late_prompt
    assert "Late Discovery" in late_prompt
    # Notebook notes + memory still preserved.
    assert "Lab observation" in late_prompt
    assert "changed from blue to green" in late_prompt
    assert "remember zephyr review focus" in late_prompt
    # Recent chat history still preserved.
    assert "First hello about filler" in late_prompt
    # Key used for the call but never leaked into prompts.
    assert keys[1] == "long-enough-test-key-12345"
    assert all("long-enough-test-key-12345" not in p for p in prompts)
    # Session citations include the late source.
    assert any(c["source_id"] == late["id"] for c in second.json()["citations"])
