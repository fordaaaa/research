"""Small REST client for the optional Gemini provider."""
from __future__ import annotations

import httpx


class GeminiError(Exception):
    pass


def generate(api_key: str, model: str, prompt: str) -> str:
    try:
        response = httpx.post(
            f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent",
            headers={"x-goog-api-key": api_key},
            json={"contents": [{"parts": [{"text": prompt}]}]},
            timeout=45.0,
        )
        response.raise_for_status()
        payload = response.json()
        text = payload["candidates"][0]["content"]["parts"][0]["text"].strip()
        if not text:
            raise ValueError("empty response")
        return text
    except (httpx.HTTPError, KeyError, IndexError, TypeError, ValueError) as exc:
        raise GeminiError("Gemini could not answer right now. Check your key, model, and free-tier limit.") from exc
