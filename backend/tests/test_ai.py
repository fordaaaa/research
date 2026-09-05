from __future__ import annotations

from core import gemini, settings
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
