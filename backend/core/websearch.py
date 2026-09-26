"""Keyless web discovery for finding sources to add to a notebook."""
from __future__ import annotations

from collections import Counter

from ddgs import DDGS

from core.models import WebSearchResult
from core.search import EmptyQuery, parse_query, stemmed_words

TITLE_WEIGHT = 3.0

# Minimum relevance score for a web result to be returned.
#
# DDGS always returns up to `limit` rows even for gibberish queries, so
# without a floor junk is presented as equals and the frontend empty state
# can never fire. The floor is absolute (not relative to the top score):
# score = sum over query terms of (title hits * TITLE_WEIGHT + snippet hits),
# so MIN_WEB_SCORE = 1.0 requires at least one query-term hit in the title
# or snippet. Unrelated junk scores exactly 0 and is dropped, while any
# genuine term overlap passes — a single relevant hit is never dropped just
# for scoring lower than a stronger hit.
MIN_WEB_SCORE = 1.0


class WebSearchError(Exception):
    pass


def score_web_result(query: str, title: str, snippet: str) -> float:
    """Score a single web result against the query (deterministic, no I/O)."""
    try:
        parsed = parse_query(query)
    except EmptyQuery:
        return 0.0
    if not parsed.terms and not parsed.phrases:
        return 0.0
    title_counts = Counter(stemmed_words(title))
    snippet_counts = Counter(stemmed_words(snippet))
    score = 0.0
    for term in parsed.terms:
        score += title_counts.get(term, 0) * TITLE_WEIGHT
        score += snippet_counts.get(term, 0)
    if parsed.phrases:
        combined = f"{title.lower()} {snippet.lower()}"
        for phrase in parsed.phrases:
            score += combined.count(phrase) * TITLE_WEIGHT
    return score


def filter_web_results(query: str, results: list[WebSearchResult]) -> list[WebSearchResult]:
    """Drop results below the relevance floor, preserving order."""
    return [r for r in results if score_web_result(query, r.title, r.snippet) >= MIN_WEB_SCORE]


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
    return filter_web_results(query, results)
