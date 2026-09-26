"""Query parsing and relevance scoring for keyword search.

Independent of storage. `parse_query` turns a raw query string into search terms
and exact phrases (quoted). `score_chunk` decides whether a chunk matches and
how relevant it is. Orchestration — iterating chunks, applying filters — lives
in core.store.
"""
from __future__ import annotations

from collections import Counter
import math
import re

_WORD = re.compile(r"[a-z0-9']+")
_PHRASE = re.compile(r'"([^"]+)"')

PROXIMITY_WINDOW = 60  # chars; all terms within this span earn a proximity bonus
PHRASE_BONUS = 12      # extra score per phrase substring match

# Common English stopwords. Short on purpose — only words that really don't
# carry meaning and would otherwise dominate IDF calculations.
STOPWORDS: frozenset[str] = frozenset(
    """
    a an and are as at be been being but by did do does for from had has have
    he her him his i if in into is it its just me my not of on or our she that
    the their them then there these they this those to was we were what when
    where which who why will with would you your
    """.split()
)

# Light Porter-style suffix stripper. Drops common English inflectional
# suffixes so morphology variants collapse ("mitochondria" / "mitochondrial"
# / "mitochondrion" -> "mitochondri"). Longer suffixes first so "ies" beats "s".
_SUFFIXES: tuple[tuple[str, str], ...] = (
    ("ational", "ate"), ("tional", "tion"), ("ization", "ize"),
    ("ation", "ate"), ("fulness", "ful"), ("ousness", "ous"),
    ("iveness", "ive"), ("iviti", "ive"), ("biliti", "ble"),
    ("ies", "i"), ("ied", "i"), ("ying", "y"),
    ("ement", ""), ("ment", ""), ("ness", ""), ("able", ""), ("ible", ""),
    ("ing", ""), ("ed", ""), ("ly", ""), ("s", ""),
)


def stem(word: str) -> str:
    """Light suffix-stripping stemmer. Returns the input lowercased."""
    w = word.lower()
    if len(w) <= 3:
        return w
    for suf, repl in _SUFFIXES:
        if w.endswith(suf) and len(w) - len(suf) >= 3:
            return w[: -len(suf)] + repl
    return w


class EmptyQuery(Exception):
    """Raised when a query parses to no searchable terms (e.g. only quotes)."""


class ParsedQuery:
    def __init__(
        self,
        terms: list[str],           # stemmed, stopwords removed
        phrases: list[str],         # raw lowercased phrase strings (not stemmed)
        original_terms: list[str],  # unstemmed, for highlight display
    ) -> None:
        self.terms = terms
        self.phrases = phrases
        self.original_terms = original_terms

    @property
    def is_empty(self) -> bool:
        return not self.terms and not self.phrases


def parse_query(query: str) -> ParsedQuery:
    """Split a query into lowercase terms and exact phrases (`"..."`).

    Stopwords are dropped from `terms`. Phrases are kept verbatim (not stemmed)
    so quoted substring matching still works.
    """
    raw_phrases = _PHRASE.findall(query)
    remainder = _PHRASE.sub(" ", query)
    original_terms = [t for t in _WORD.findall(remainder.lower()) if t not in STOPWORDS]
    terms = [stem(t) for t in original_terms]
    phrases = []
    for raw in raw_phrases:
        joined = " ".join(_WORD.findall(raw.lower()))
        if joined:
            phrases.append(joined)
    parsed = ParsedQuery(terms, phrases, original_terms)
    if parsed.is_empty:
        raise EmptyQuery
    return parsed


def stemmed_words(text: str) -> list[str]:
    """Return normalized word stems from text."""
    return [stem(word) for word in _WORD.findall(text.lower())]


def score_chunk(
    text: str,
    query: ParsedQuery,
    df: dict[str, int] | None = None,
    n_docs: int = 1,
) -> tuple[bool, float, list[str]]:
    """Return (matched, score, matched_term_stems) for a chunk.

    - `df` maps stemmed term -> number of sources containing it (document freq).
    - `n_docs` is the total number of sources in the notebook.
    - When `df` is None or empty, falls back to plain term frequency (no IDF).
    - `matched_term_stems` lists each stem that hit at least once — used by the
      snippet renderer to highlight matched terms in the UI.
    """
    lower = text.lower()
    term_counts = Counter(stemmed_words(text))
    if query.terms and not all(term_counts[t] for t in query.terms):
        return False, 0, []
    if any(p not in lower for p in query.phrases):
        return False, 0, []

    score = 0.0
    matched_stems: list[str] = []
    for t in query.terms:
        tf = term_counts[t]
        if not tf:
            return False, 0, []  # belt-and-suspenders; parser already guarantees this
        score += _tfidf(tf, t, df, n_docs)
        matched_stems.append(t)

    for phrase in query.phrases:
        score += PHRASE_BONUS * lower.count(phrase)

    score += _proximity_bonus(lower, query.terms)
    return True, score, matched_stems


def is_single_token_query(query: ParsedQuery) -> bool:
    """True when the query is one bare token (no phrases, no extra terms).

    Reuses the parsed query so stopword removal and phrase extraction stay
    consistent with the normal path; multi-token and phrase queries are
    never eligible for prefix fallback.
    """
    return len(query.terms) == 1 and len(query.phrases) == 0


def score_prefix_chunk(
    text: str,
    query: ParsedQuery,
    df_prefix: int = 0,
    n_docs: int = 1,
) -> tuple[bool, float, list[str]]:
    """Prefix fallback scorer for single-token queries with zero exact hits.

    A chunk matches when any indexed stem starts with the query stem (or the
    raw lowercased token, per existing normalization). Scoring mirrors the
    normal path: prefix-term frequency scaled by smoothed IDF plus the same
    single-term proximity bonus, so fallback hits sort like normal hits.
    """
    if not is_single_token_query(query):
        return False, 0, []
    q_stem = query.terms[0]
    q_raw = query.original_terms[0] if query.original_terms else q_stem
    counts = Counter(stemmed_words(text))
    matched = sorted(
        {t for t in counts if t.startswith(q_stem) or t.startswith(q_raw)}
    )
    if not matched:
        return False, 0, []
    tf = sum(counts[t] for t in matched)
    df_t = max(1, df_prefix)
    score = tf * math.log1p(n_docs / df_t)
    # Single-term proximity bonus mirrors the normal path: one occurrence
    # always yields best_span 0, i.e. int(PROXIMITY_WINDOW / 3).
    score += int(PROXIMITY_WINDOW / 3)
    return True, score, matched


def _tfidf(tf: int, term: str, df: dict[str, int] | None, n_docs: int) -> float:
    """Plain term frequency scaled by smoothed inverse document frequency.

    Uses smoothed IDF: log(1 + N/df). When df is unknown we fall back to raw tf
    so the function stays usable from tests that don't pre-compute df.
    """
    if not df or term not in df:
        return float(tf)
    df_t = max(1, df[term])
    return tf * math.log1p(n_docs / df_t)


def _proximity_bonus(lower: str, terms: list[str]) -> int:
    if not terms:
        return 0
    needed = set(terms)
    occurrences = [
        (match.start(), token)
        for match in _WORD.finditer(lower)
        if (token := stem(match.group())) in needed
    ]
    counts: Counter[str] = Counter()
    present = 0
    left = 0
    best_span: int | None = None
    for end_pos, token in occurrences:
        counts[token] += 1
        if counts[token] == 1:
            present += 1
        while present == len(needed):
            span = end_pos - occurrences[left][0]
            best_span = span if best_span is None else min(best_span, span)
            left_token = occurrences[left][1]
            counts[left_token] -= 1
            if counts[left_token] == 0:
                present -= 1
            left += 1
    if best_span is None or best_span > PROXIMITY_WINDOW:
        return 0
    return int((PROXIMITY_WINDOW - best_span) / 3)
