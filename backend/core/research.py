"""Keyless research helpers: query planning, candidate ranking, digest notes."""
from __future__ import annotations

import re
from datetime import datetime, timezone
from urllib.parse import urlsplit, urlunsplit

from core.models import Source, WebSearchResult

MAX_PLAN_QUERIES = 5
MAX_CANDIDATES = 15
MAX_PER_DOMAIN = 2
EXCERPT_CHARS = 400

_STOPWORDS = frozenset(
    {
        "the", "a", "an", "and", "or", "for", "with", "how", "what", "why",
        "are", "is", "its", "their", "from", "that", "this", "into", "your",
        "you", "can", "was", "were", "has", "have", "of", "to", "in", "on", "at", "by",
    }
)

_BULLET = re.compile(r"^(?:\d+[.)]|[-*•])\s*")
_REFUSAL = re.compile(r"^(sorry|i cannot|i can'?t|unfortunately|as an ai)\b", re.IGNORECASE)


def plan_queries(topic: str, year: int | None = None) -> list[str]:
    """Deterministic sub-queries for a research topic; works with no key."""
    if year is None:
        year = datetime.now(timezone.utc).year
    t = " ".join(topic.split()).strip(" ?.!\"'")
    if not t:
        return []
    templates = [
        t,
        f"what is {t}",
        f"{t} examples",
        f"{t} criticism and limitations",
        f"{t} recent developments {year}",
    ]
    queries: list[str] = []
    seen: set[str] = set()
    for query in templates:
        key = query.lower()
        if key not in seen:
            seen.add(key)
            queries.append(query)
    return queries[:MAX_PLAN_QUERIES]


def build_planner_prompt(topic: str) -> str:
    return (
        "You plan web research. Break the topic into 4 to 6 search queries that together "
        "cover: an overview or definition, concrete examples, criticism or limitations, "
        "and recent developments. Rules: each query is a short self-contained search phrase "
        "under 60 characters, repeats the topic's key words, no quotes, no numbering, "
        "no explanation. Output ONLY the queries, one per line.\n\n"
        f"TOPIC: {topic}"
    )


def parse_ai_queries(answer: str) -> list[str]:
    """Extract search queries from a model's line-based answer; [] if unusable."""
    queries: list[str] = []
    seen: set[str] = set()
    for raw_line in answer.splitlines():
        line = _BULLET.sub("", raw_line.strip()).strip("\"'").strip()
        if not line:
            continue
        if len(line) < 3 or len(line) > 120:
            continue
        if "http" in line.lower() or line.endswith(":"):
            continue
        if _REFUSAL.match(line):
            continue
        key = line.lower()
        if key in seen:
            continue
        seen.add(key)
        queries.append(line)
    return queries[:6]


def normalize_url(url: str) -> str:
    parts = urlsplit(url.strip())
    netloc = parts.netloc.lower()
    if netloc.startswith("www."):
        netloc = netloc[4:]
    path = parts.path
    while path.endswith("/"):
        path = path[:-1]
    return urlunsplit((parts.scheme.lower(), netloc, path, parts.query, ""))


def _host(url: str) -> str:
    return urlsplit(url).netloc.lower().removeprefix("www.")


def _tokens(text: str) -> set[str]:
    return {
        token for token in re.split(r"[^a-z0-9]+", text.lower())
        if len(token) >= 3 and token not in _STOPWORDS
    }


def rank_candidates(
    results_per_query: list[tuple[str, list[WebSearchResult]]],
    existing_urls: set[str],
    limit: int = MAX_CANDIDATES,
    per_domain: int = MAX_PER_DOMAIN,
) -> list[dict]:
    """Merge and rank web results across queries. Deterministic, keyless."""
    merged: dict[str, dict] = {}
    for query, results in results_per_query:
        for position, result in enumerate(results, start=1):
            key = normalize_url(result.url)
            if not key:
                continue
            entry = merged.get(key)
            if entry is None:
                entry = {
                    "title": result.title,
                    "url": result.url,
                    "snippet": result.snippet,
                    "best_pos": position,
                    "matched_queries": [],
                    "query_keys": set(),
                }
                merged[key] = entry
            entry["best_pos"] = min(entry["best_pos"], position)
            query_key = query.lower()
            if query_key not in entry["query_keys"]:
                entry["query_keys"].add(query_key)
                entry["matched_queries"].append(query)

    scored: list[dict] = []
    for entry in merged.values():
        if normalize_url(entry["url"]) in existing_urls:
            continue
        overlap = _tokens(" ".join(entry["matched_queries"])) & _tokens(
            f"{entry['title']} {entry['snippet']}"
        )
        entry["score"] = 3 * len(entry["matched_queries"]) + max(0, 4 - entry["best_pos"]) + min(5, len(overlap))
        scored.append(entry)

    scored.sort(key=lambda e: (-e["score"], e["best_pos"], normalize_url(e["url"])))
    selected: list[dict] = []
    domain_counts: dict[str, int] = {}
    for entry in scored:
        host = _host(entry["url"])
        if domain_counts.get(host, 0) >= per_domain:
            continue
        domain_counts[host] = domain_counts.get(host, 0) + 1
        selected.append(
            {
                "title": entry["title"],
                "url": entry["url"],
                "snippet": entry["snippet"],
                "score": entry["score"],
                "matched_queries": entry["matched_queries"],
            }
        )
        if len(selected) >= limit:
            break
    return selected


def build_digest(topic: str, queries: list[str], sources: list[Source], excerpt_chars: int = EXCERPT_CHARS) -> str:
    """Structured keyless overview: topic, queries, numbered source excerpts."""
    lines = [f"Research overview: {topic}", ""]
    if queries:
        lines.append("Search queries used")
        lines.extend(f"- {query}" for query in queries)
        lines.append("")
    lines.append("Sources")
    for number, source in enumerate(sources, start=1):
        url = source.meta.get("url")
        lines.append(f"{number}. {source.title}")
        if url:
            lines.append(f"   {url}")
        text = " ".join((source.chunks[0].text if source.chunks else "").split())
        if text:
            if len(text) > excerpt_chars:
                text = text[:excerpt_chars].rstrip() + "…"
            lines.append(f"   {text}")
        lines.append("")
    return "\n".join(lines).rstrip()


def build_synthesis_prompt(topic: str, excerpts: list[str]) -> str:
    return (
        "Write a structured research overview of the TOPIC using only the numbered "
        "excerpts below. Sections: a short summary, key findings (bulleted), open "
        "questions or disagreements. Cite every claim with a marker like [1] matching "
        "the excerpt number. If the excerpts do not cover something, say so.\n\n"
        f"TOPIC: {topic}\n\n"
        "EXCERPTS:\n" + "\n\n".join(excerpts)
    )
