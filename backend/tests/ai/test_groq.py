"""Groq BYOK adapter + dispatch + settings tests (RED-first).

Official sources (verified 2026-10-02):
- OpenAI-compatible base: https://console.groq.com/docs/openai
  POST https://api.groq.com/openai/v1/chat/completions
- Production models: https://console.groq.com/docs/models
  openai/gpt-oss-20b (default) and openai/gpt-oss-120b (same-provider fallback)
- Free-plan per-model limits: https://console.groq.com/docs/rate-limits
  30 RPM / 1,000 RPD / 8,000 TPM / 200k TPD at org level; limits vary by account.
"""
from __future__ import annotations

import httpx
import pytest

from core import providers
from core.models import AI_DEFAULT_MODELS, AISettingsUpdate
from core.store import Store


def _user(tmp_path):
    store = Store(root=tmp_path / "data")
    return store, store.create_user("groq@example.com", "password123").id


def _status_error(status: int, headers: dict[str, str] | None = None) -> httpx.HTTPStatusError:
    request = httpx.Request("POST", "https://api.groq.com/openai/v1/chat/completions")
    response = httpx.Response(status, headers=headers or {}, request=request)
    return httpx.HTTPStatusError(f"{status} error", request=request, response=response)


def test_groq_module_exposes_adapter_contract():
    from core import groq

    assert hasattr(groq, "GroqError")
    assert callable(groq.generate)
    err = groq.GroqError("msg", status=429, retry_after=3.0)
    assert err.status == 429
    assert err.retry_after == 3.0


def test_groq_success_sends_bearer_bounded_budget(monkeypatch):
    from core import groq

    calls: list[dict] = []

    class Response:
        def raise_for_status(self):
            pass

        def json(self):
            return {"choices": [{"message": {"content": " grounded answer "}}]}

    def post(url, headers=None, json=None, timeout=None):
        calls.append({"url": url, "headers": headers, "json": json, "timeout": timeout})
        return Response()

    monkeypatch.setattr(groq.httpx, "post", post)
    assert groq.generate("gsk-test-key-123", "openai/gpt-oss-20b", "prompt") == "grounded answer"
    assert calls[0]["url"] == "https://api.groq.com/openai/v1/chat/completions"
    assert calls[0]["headers"] == {"Authorization": "Bearer gsk-test-key-123"}
    assert calls[0]["json"]["model"] == "openai/gpt-oss-20b"
    assert calls[0]["json"]["messages"] == [{"role": "user", "content": "prompt"}]
    # Output is bounded; provider quotas also count the input prompt.
    assert calls[0]["json"]["max_completion_tokens"] == 1024
    assert calls[0]["timeout"] == 45.0


def test_groq_429_preserves_retry_after_and_generic_message(monkeypatch):
    from core import groq

    def post(*args, **kwargs):
        raise _status_error(429, {"retry-after": "3"})

    monkeypatch.setattr(groq.httpx, "post", post)
    with pytest.raises(groq.GroqError) as exc_info:
        groq.generate("gsk-test-key-123", "openai/gpt-oss-20b", "prompt")
    assert exc_info.value.status == 429
    assert exc_info.value.retry_after == 3.0
    message = str(exc_info.value)
    assert "Groq" in message or "free-tier" in message
    assert "gsk-test-key" not in message


@pytest.mark.parametrize(
    "payload",
    [
        {},
        {"choices": []},
        {"choices": [{"message": {"content": "   "}}]},
        {"choices": [{"message": {"content": None}}]},
        {"choices": [{"message": {}}]},
        # Reasoning must never leak as the answer: only message.content counts.
        {"choices": [{"message": {"reasoning_content": "secret chain", "content": " "}}]},
    ],
)
def test_groq_malformed_or_empty_shape_rejected(monkeypatch, payload):
    from core import groq

    class Response:
        def raise_for_status(self):
            pass

        def json(self):
            return payload

    monkeypatch.setattr(groq.httpx, "post", lambda *a, **k: Response())
    with pytest.raises(groq.GroqError):
        groq.generate("gsk-test-key-123", "openai/gpt-oss-20b", "prompt")


def test_groq_401_preserves_status_for_key_error_mapping(monkeypatch):
    from core import groq

    def post(*args, **kwargs):
        raise _status_error(401)

    monkeypatch.setattr(groq.httpx, "post", post)
    with pytest.raises(groq.GroqError) as exc_info:
        groq.generate("bad-key-123456", "openai/gpt-oss-20b", "prompt")
    assert exc_info.value.status == 401


def test_groq_transport_errors_are_generic_without_leaks(monkeypatch):
    from core import groq

    def post(*args, **kwargs):
        raise httpx.ConnectError("dns down")

    monkeypatch.setattr(groq.httpx, "post", post)
    with pytest.raises(groq.GroqError) as exc_info:
        groq.generate("gsk-test-key-123", "openai/gpt-oss-20b", "super secret prompt")
    assert exc_info.value.status is None
    message = str(exc_info.value)
    assert "gsk-test-key" not in message
    assert "super secret prompt" not in message
    assert "dns down" not in message


def test_providers_groq_defaults_and_same_provider_fallback_only():
    assert providers.DEFAULT_MODELS["groq"] == "openai/gpt-oss-20b"
    assert AI_DEFAULT_MODELS["groq"] == "openai/gpt-oss-20b"
    assert providers.FALLBACK_MODELS["groq"] == ["openai/gpt-oss-120b"]
    # Existing defaults unchanged.
    assert providers.DEFAULT_MODELS["gemini"] == "gemini-3.5-flash-lite"
    assert providers.DEFAULT_MODELS["openrouter"] == "nvidia/nemotron-3-ultra-550b-a55b:free"
    chain = providers._model_chain("groq", "openai/gpt-oss-20b")
    assert chain == ["openai/gpt-oss-20b", "openai/gpt-oss-120b"]
    # No cross-provider auto-switch.
    for candidate in chain:
        assert candidate.startswith("openai/gpt-oss-")


def test_providers_groq_retry_then_succeeds(monkeypatch):
    from core import groq

    payload = {"choices": [{"message": {"content": " retried answer "}}]}

    class Response:
        def raise_for_status(self):
            pass

        def json(self):
            return payload

    calls: list[int] = []

    def post(*args, **kwargs):
        calls.append(1)
        if len(calls) == 1:
            raise _status_error(429)
        return Response()

    monkeypatch.setattr(groq.httpx, "post", post)
    sleeps: list[float] = []
    monkeypatch.setattr(providers, "sleep", lambda seconds: sleeps.append(seconds))
    answer, model = providers.generate("groq", "gsk-test-key-123", "openai/gpt-oss-20b", "prompt")
    assert answer == "retried answer"
    assert model == "openai/gpt-oss-20b"
    assert len(calls) == 2
    assert sleeps == [1.5]


def test_providers_groq_falls_back_within_provider(monkeypatch):
    from core import groq

    payload = {"choices": [{"message": {"content": "backup answer"}}]}

    class Response:
        def raise_for_status(self):
            pass

        def json(self):
            return payload

    seen: list[str] = []

    def post(url, headers=None, json=None, timeout=None):
        seen.append(json["model"])
        if json["model"] == "stale-model":
            raise _status_error(404)
        return Response()

    monkeypatch.setattr(groq.httpx, "post", post)
    monkeypatch.setattr(providers, "sleep", lambda seconds: None)
    answer, model = providers.generate("groq", "gsk-test-key-123", "stale-model", "prompt")
    assert answer == "backup answer"
    assert model == "openai/gpt-oss-120b"
    assert seen[0] == "stale-model"


def test_providers_groq_auth_failure_aborts_without_backups(monkeypatch):
    from core import groq

    calls: list[int] = []

    def post(*args, **kwargs):
        calls.append(1)
        raise _status_error(401)

    monkeypatch.setattr(groq.httpx, "post", post)
    with pytest.raises(providers.AIError) as exc_info:
        providers.generate("groq", "bad-key", "openai/gpt-oss-20b", "prompt")
    assert len(calls) == 1
    assert "key" in str(exc_info.value).lower()


def test_groq_settings_default_model_and_key_never_returned(tmp_path):
    store, uid = _user(tmp_path)
    saved = store.save_ai_settings(
        uid, AISettingsUpdate(provider="groq", api_key="gsk-test-key-long-enough")
    )
    assert saved.provider == "groq"
    assert saved.model == "openai/gpt-oss-20b"
    assert saved.model_dump() == {
        "configured": True,
        "provider": "groq",
        "model": "openai/gpt-oss-20b",
    }
    assert store.ai_key(uid) == "gsk-test-key-long-enough"
    fetched = store.get_ai_settings(uid)
    assert fetched.configured is True
    assert fetched.provider == "groq"
    assert fetched.model == "openai/gpt-oss-20b"
    assert "gsk-test-key" not in str(fetched.model_dump())


def test_groq_settings_api_reload_and_chat_use_the_saved_provider(client, monkeypatch):
    response = client.put("/api/settings/ai", json={
        "provider": "groq", "api_key": "gsk-test-key-long-enough",
    })
    assert response.status_code == 200
    assert client.get("/api/settings/ai").json() == {
        "configured": True, "provider": "groq", "model": "openai/gpt-oss-20b",
    }
    notebook = client.post("/api/notebooks", json={"name": "Groq exam"}).json()
    client.post(f"/api/notebooks/{notebook['id']}/sources/text", json={
        "title": "Lecture", "text": "Mitochondria produce energy for cells.",
    })
    calls = []

    def fake_generate(provider, key, model, prompt):
        calls.append((provider, key, model))
        return "Mitochondria produce energy [1].", model

    monkeypatch.setattr(providers, "generate", fake_generate)
    answer = client.post(f"/api/notebooks/{notebook['id']}/chat", json={
        "message": "What do mitochondria produce?",
    })
    assert answer.status_code == 200
    assert calls == [("groq", "gsk-test-key-long-enough", "openai/gpt-oss-20b")]
    assert "gsk-test-key" not in answer.text
