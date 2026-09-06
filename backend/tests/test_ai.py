from __future__ import annotations

import httpx
import pytest

from core import gemini, openrouter, providers, settings
from core.models import AISettingsUpdate


def test_ai_settings_never_return_the_api_key(tmp_path):
    saved = settings.save_ai_settings(
        tmp_path,
        AISettingsUpdate(api_key="secret-key-which-is-long-enough", model="gemini-test"),
    )
    assert saved.model_dump() == {"configured": True, "provider": "gemini", "model": "gemini-test"}
    assert settings.api_key(tmp_path) == "secret-key-which-is-long-enough"
    assert "secret" not in str(settings.get_ai_settings(tmp_path).model_dump())


def test_gemini_extracts_text(monkeypatch):
    class Response:
        def raise_for_status(self):
            pass

        def json(self):
            return {"candidates": [{"content": {"parts": [{"text": " grounded answer "}]}}]}

    monkeypatch.setattr(gemini.httpx, "post", lambda *args, **kwargs: Response())
    assert gemini.generate("key", "gemini-test", "prompt") == "grounded answer"


def test_openrouter_extracts_text(monkeypatch):
    calls = []

    class Response:
        def raise_for_status(self):
            pass

        def json(self):
            return {"choices": [{"message": {"content": " grounded answer "}}]}

    def post(url, headers=None, json=None, timeout=None):
        calls.append({"url": url, "headers": headers, "json": json})
        return Response()

    monkeypatch.setattr(openrouter.httpx, "post", post)
    assert openrouter.generate("key-123456", "some-model:free", "prompt") == "grounded answer"
    assert calls[0]["url"] == "https://openrouter.ai/api/v1/chat/completions"
    assert calls[0]["headers"] == {"Authorization": "Bearer key-123456"}
    assert calls[0]["json"] == {"model": "some-model:free", "messages": [{"role": "user", "content": "prompt"}]}


def _status_error(status: int, headers: dict[str, str] | None = None) -> httpx.HTTPStatusError:
    request = httpx.Request("POST", "https://provider.invalid/v1")
    response = httpx.Response(status, headers=headers or {}, request=request)
    return httpx.HTTPStatusError(f"{status} error", request=request, response=response)


class FakePost:
    """Sequential fake for httpx.post: raise errors then return a payload."""

    def __init__(self, outcomes, payload):
        self.outcomes = outcomes
        self.payload = payload
        self.calls: list[dict] = []

    def __call__(self, url, headers=None, json=None, timeout=None):
        self.calls.append({"url": url, "json": json})
        outcome = self.outcomes[min(len(self.calls) - 1, len(self.outcomes) - 1)]
        if isinstance(outcome, Exception):
            raise outcome
        payload = self.payload

        class Response:
            def raise_for_status(self):
                pass

            def json(self):
                return payload

        return Response()


GEMINI_PAYLOAD = {"candidates": [{"content": {"parts": [{"text": " retried answer "}]}}]}
OPENROUTER_PAYLOAD = {"choices": [{"message": {"content": "backup answer"}}]}


def test_retry_on_429_then_succeeds(monkeypatch):
    fake = FakePost([_status_error(429), None], GEMINI_PAYLOAD)
    monkeypatch.setattr(gemini.httpx, "post", fake)
    sleeps: list[float] = []
    monkeypatch.setattr(providers, "sleep", lambda seconds: sleeps.append(seconds))
    answer, model = providers.generate("gemini", "key", "gemini-2.5-flash", "prompt")
    assert answer == "retried answer"
    assert model == "gemini-2.5-flash"
    assert len(fake.calls) == 2
    assert sleeps == [1.5]


def test_retry_after_header_is_respected(monkeypatch):
    fake = FakePost([_status_error(429, {"retry-after": "3"}), None], GEMINI_PAYLOAD)
    monkeypatch.setattr(gemini.httpx, "post", fake)
    sleeps: list[float] = []
    monkeypatch.setattr(providers, "sleep", lambda seconds: sleeps.append(seconds))
    providers.generate("gemini", "key", "gemini-2.5-flash", "prompt")
    assert sleeps == [3.0]


def test_falls_back_to_backup_model(monkeypatch):
    def post(url, headers=None, json=None, timeout=None):
        if json["model"] == "stale-model:free":
            raise _status_error(404)
        response = FakePost([None], OPENROUTER_PAYLOAD)
        return response(url, headers=headers, json=json, timeout=timeout)

    monkeypatch.setattr(openrouter.httpx, "post", post)
    monkeypatch.setattr(providers, "sleep", lambda seconds: None)
    answer, model = providers.generate("openrouter", "key", "stale-model:free", "prompt")
    assert answer == "backup answer"
    assert model == "meta-llama/llama-3.3-70b-instruct:free"


def test_auth_failure_aborts_without_backups(monkeypatch):
    fake = FakePost([_status_error(401)], OPENROUTER_PAYLOAD)
    monkeypatch.setattr(openrouter.httpx, "post", fake)
    with pytest.raises(providers.AIError) as exc_info:
        providers.generate("openrouter", "key", "stale-model:free", "prompt")
    assert len(fake.calls) == 1
    assert "key" in str(exc_info.value)


def test_all_models_failing_raises_generic_error(monkeypatch):
    monkeypatch.setattr(openrouter.httpx, "post", FakePost([_status_error(429)], OPENROUTER_PAYLOAD))
    monkeypatch.setattr(providers, "sleep", lambda seconds: None)
    with pytest.raises(providers.AIError) as exc_info:
        providers.generate("openrouter", "key", "stale-model:free", "prompt")
    message = str(exc_info.value)
    assert "rate-limited" in message
    assert "openrouter.ai" not in message
    assert "candidates" not in message


def test_ai_settings_roundtrip_openrouter(tmp_path):
    saved = settings.save_ai_settings(
        tmp_path,
        AISettingsUpdate(provider="openrouter", api_key="sk-or-long-enough-key"),
    )
    assert saved.model_dump() == {
        "configured": True,
        "provider": "openrouter",
        "model": "meta-llama/llama-3.3-70b-instruct:free",
    }
    assert settings.api_key(tmp_path) == "sk-or-long-enough-key"
    assert settings.get_ai_settings(tmp_path).provider == "openrouter"


def test_legacy_settings_without_provider_default_to_gemini(tmp_path):
    settings.save_ai_settings(
        tmp_path,
        AISettingsUpdate(api_key="secret-key-which-is-long-enough", model="gemini-test"),
    )
    path = tmp_path / "settings.json"
    import json

    data = json.loads(path.read_text())
    del data["ai"]["provider"]
    path.write_text(json.dumps(data))
    assert settings.get_ai_settings(tmp_path).provider == "gemini"
