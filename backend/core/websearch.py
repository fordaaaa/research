"""Keyless web discovery for finding sources to add to a notebook."""
from __future__ import annotations

from ddgs import DDGS

from core.models import WebSearchResult


class WebSearchError(Exception):
    pass


def search_web(query: str, limit: int = 8) -> list[WebSearchResult]:
    """Return a small, safe-search-enabled set of public web results."""
    try:
        rows = DDGS(timeout=8).text(query, max_results=limit, safesearch="moderate")
    except Exception as exc:
        raise WebSearchError("web search is temporarily unavailable") from exc
    results = []
    for row in rows:
        url = row.get("href")
        title = row.get("title")
        if isinstance(url, str) and isinstance(title, str):
            results.append(
                WebSearchResult(
                    title=title.strip() or url,
                    url=url,
                    snippet=str(row.get("body") or "").strip(),
                )
            )
    return results
