"""Provider dispatch with retry and free-model fallback."""
from __future__ import annotations

from time import sleep

from core import gemini, openrouter

FALLBACK_MODELS: dict[str, list[str]] = {
    "gemini": ["gemini-2.5-flash-lite", "gemini-2.0-flash"],
    "openrouter": [
        "meta-llama/llama-3.3-70b-instruct:free",
        "deepseek/deepseek-chat-v3-0324:free",
    ],
}
DEFAULT_MODELS: dict[str, str] = {
    "gemini": "gemini-2.5-flash",
    "openrouter": "meta-llama/llama-3.3-70b-instruct:free",
}

_ADAPTERS = {"gemini": gemini, "openrouter": openrouter}
_ADAPTER_ERRORS = (gemini.GeminiError, openrouter.OpenRouterError)


class AIError(Exception):
    pass


def generate(provider: str, api_key: str, model: str, prompt: str) -> tuple[str, str]:
    """Return (answer, model_that_answered); falls back to backup free models."""
    adapter = _ADAPTERS[provider]
    chain = _model_chain(provider, model)
    last_exc: Exception | None = None
    for index, candidate in enumerate(chain):
        attempts = 2 if index == 0 else 1
        for attempt in range(attempts):
            try:
                return adapter.generate(api_key, candidate, prompt), candidate
            except _ADAPTER_ERRORS as exc:
                last_exc = exc
                if exc.status in (401, 403):
                    raise AIError("AI could not answer. Check your API key in Settings.") from exc
                retryable = exc.status is None or exc.status == 429 or exc.status >= 500
                if retryable and attempt < attempts - 1:
                    sleep(min(max(exc.retry_after or 1.5, 1.0), 8.0))
                    continue
                break
    raise AIError(
        "AI could not answer right now — the free tier may be rate-limited. "
        "Try again in a minute or check the model in Settings."
    ) from last_exc


def _model_chain(provider: str, model: str) -> list[str]:
    chain = [model] + FALLBACK_MODELS.get(provider, [])
    deduped: list[str] = []
    for candidate in chain:
        if candidate not in deduped:
            deduped.append(candidate)
    return deduped[:3]
