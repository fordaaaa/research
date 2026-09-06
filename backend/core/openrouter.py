"""Small REST client for the optional OpenRouter provider."""
from __future__ import annotations

import httpx


class OpenRouterError(Exception):
    def __init__(self, message: str, status: int | None = None, retry_after: float | None = None):
        super().__init__(message)
        self.status = status
        self.retry_after = retry_after


def generate(api_key: str, model: str, prompt: str) -> str:
    try:
        response = httpx.post(
            "https://openrouter.ai/api/v1/chat/completions",
            headers={"Authorization": f"Bearer {api_key}"},
            json={"model": model, "messages": [{"role": "user", "content": prompt}]},
            timeout=45.0,
        )
        response.raise_for_status()
        payload = response.json()
        text = payload["choices"][0]["message"]["content"].strip()
        if not text:
            raise ValueError("empty response")
        return text
    except httpx.HTTPStatusError as exc:
        raise OpenRouterError(
            "OpenRouter could not answer right now. Check your key, model, and free-tier limit.",
            status=exc.response.status_code,
            retry_after=_retry_after(exc.response),
        ) from exc
    except (httpx.HTTPError, KeyError, IndexError, TypeError, ValueError) as exc:
        raise OpenRouterError("OpenRouter could not answer right now. Check your key, model, and free-tier limit.") from exc


def _retry_after(response: httpx.Response) -> float | None:
    try:
        return float(response.headers.get("retry-after", ""))
    except ValueError:
        return None
