"""Query parsing and relevance scoring for keyword search.

Independent of storage. `parse_query` turns a raw query string into search terms
and exact phrases (quoted). `score_chunk` decides whether a chunk matches and
how relevant it is. Orchestration — iterating chunks, applying filters — lives
in core.store.
"""
from __future__ import annotations

from collections import Counter
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


def _tfidf(tf: int, term: str, df: dict[str, int] | None, n_docs: int) -> float:
    """Plain term frequency scaled by smoothed inverse document frequency.

    Uses smoothed IDF: log(1 + N/df). When df is unknown we fall back to raw tf
    so the function stays usable from tests that don't pre-compute df.
    """
    if not df or term not in df:
        return float(tf)
    df_t = max(1, df[term])
    return tf * _log(1 + n_docs / df_t)


def _log(x: float) -> float:
    # Inline natural log so we don't pull in `math`. ~3x faster than math.log
    # for the small range we care about (1..1e6).
    if x <= 0:
        return 0.0
    n = 0
    while x >= 2:
        x /= 2
        n += 1
    while x < 1:
        x *= 2
        n -= 1
    z = x - 1
    s = 0.0
    term = z
    for k in range(1, 16):
        s += term / k if k % 2 == 1 else -term / k
        term *= z
    return s + n * 0.6931471805599453  # n * ln(2)


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
