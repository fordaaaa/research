"""REST client for optional per-user Groq keys; returns answer content only."""
from __future__ import annotations

import httpx

GROQ_URL = "https://api.groq.com/openai/v1/chat/completions"
MAX_COMPLETION_TOKENS = 1024


class GroqError(Exception):
    def __init__(self, message: str, status: int | None = None, retry_after: float | None = None):
        super().__init__(message)
        self.status = status
        self.retry_after = retry_after


def generate(api_key: str, model: str, prompt: str) -> str:
    try:
        response = httpx.post(
            GROQ_URL,
            headers={"Authorization": f"Bearer {api_key}"},
            json={
                "model": model,
                "messages": [{"role": "user", "content": prompt}],
                "max_completion_tokens": MAX_COMPLETION_TOKENS,
            },
            timeout=45.0,
        )
        response.raise_for_status()
        payload = response.json()
        text = payload["choices"][0]["message"]["content"]
        if not isinstance(text, str):
            raise ValueError("malformed response")
        text = text.strip()
        if not text:
            raise ValueError("empty response")
        return text
    except httpx.HTTPStatusError as exc:
        raise GroqError(
            "Groq could not answer right now. Check your key, model, and free-tier limit.",
            status=exc.response.status_code,
            retry_after=_retry_after(exc.response),
        ) from exc
    except (httpx.HTTPError, KeyError, IndexError, TypeError, ValueError) as exc:
        raise GroqError("Groq could not answer right now. Check your key, model, and free-tier limit.") from exc


def _retry_after(response: httpx.Response) -> float | None:
    try:
        return float(response.headers.get("retry-after", ""))
    except ValueError:
        return None
