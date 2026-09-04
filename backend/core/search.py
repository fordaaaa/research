"""Query parsing and relevance scoring for keyword search.

Independent of storage. `parse_query` turns a raw query string into search terms
and exact phrases (quoted). `score_chunk` decides whether a chunk matches and
how relevant it is. Orchestration — iterating chunks, applying filters — lives
in core.store.
"""
from __future__ import annotations

import re

_WORD = re.compile(r"[a-z0-9']+")
_PHRASE = re.compile(r'"([^"]+)"')

PROXIMITY_WINDOW = 60  # chars; all terms within this span earn a proximity bonus
PHRASE_BONUS = 12  # extra score per phrase substring match


class EmptyQuery(Exception):
    """Raised when a query parses to no searchable terms (e.g. only quotes)."""


class ParsedQuery:
    def __init__(self, terms: list[str], phrases: list[str]) -> None:
        self.terms = terms
        self.phrases = phrases

    @property
    def is_empty(self) -> bool:
        return not self.terms and not self.phrases


def parse_query(query: str) -> ParsedQuery:
    """Split a query into lowercase terms and exact phrases (`"..."`)."""
    raw_phrases = _PHRASE.findall(query)
    remainder = _PHRASE.sub(" ", query)
    terms = _WORD.findall(remainder.lower())
    phrases = []
    for raw in raw_phrases:
        joined = " ".join(_WORD.findall(raw.lower()))
        if joined:
            phrases.append(joined)
    parsed = ParsedQuery(terms, phrases)
    if parsed.is_empty:
        raise EmptyQuery
    return parsed


def score_chunk(text: str, query: ParsedQuery) -> tuple[bool, int]:
    """Return (matched, score) for a chunk against a parsed query.

    A chunk matches only if every term AND every phrase appears (AND semantics).
    Score rewards term frequency, exact-phrase matches, and term proximity.
    """
    lower = text.lower()
    if not all(lower.count(t) for t in query.terms):
        return False, 0
    if any(p not in lower for p in query.phrases):
        return False, 0
    score = sum(lower.count(t) for t in query.terms)
    for phrase in query.phrases:
        score += PHRASE_BONUS * lower.count(phrase)
    score += _proximity_bonus(lower, query.terms)
    return True, score


def _proximity_bonus(lower: str, terms: list[str]) -> int:
    if not terms:
        return 0
    positions = []
    for t in terms:
        pos = lower.find(t)
        if pos == -1:
            return 0
        positions.append(pos)
    span = max(positions) - min(positions)
    if span <= PROXIMITY_WINDOW:
        return int((PROXIMITY_WINDOW - span) / 3)
    return 0