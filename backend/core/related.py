"""Opt-in lexical relevance: scoped aliases and unambiguous one-edit typos."""
from __future__ import annotations

import hashlib
import heapq
import math
from collections import Counter
from dataclasses import dataclass
from typing import TYPE_CHECKING, Iterable, Iterator

from core.models import Chunk, SearchHit
from core.search import EmptyQuery, PHRASE_BONUS, ParsedQuery, parse_query, stem, stemmed_words

if TYPE_CHECKING:
    from core.store import Store

QUESTION_WORDS = frozenset("""
    how can could should would may might shall explain describe tell show give
    list summarize summary compare contrast versus vs between difference
    differences different define definition meaning discuss overview detail
    details question answer about regarding please kindly simple simply terms
    term whats what's important importance steps
""".split())
_QUESTION_STEMS = frozenset(stem(word) for word in QUESTION_WORDS)
# Deliberately scoped academic aliases, not a general semantic dictionary.
_ALIAS_SETS = (
    ("mitochondria", "mitochondrion", "mitochondrial", "powerhouse"),
    ("dna", "deoxyribonucleic"),
    ("rna", "ribonucleic"),
)
_ALIAS_PHRASES = {"atp": ("adenosine triphosphate",), "cpu": ("central processing unit",)}
_ALIASES = {stem(word): frozenset(stem(alias) for alias in group)
            for group in _ALIAS_SETS for word in group}
_MAX_TERMS = 64


@dataclass(frozen=True)
class QueryGroup:
    term: str
    alternatives: frozenset[str]
    corrected: bool = False
    phrases: tuple[str, ...] = ()

    def matches(self, terms: Iterable[str], text: str = "") -> set[str]:
        matched = set(self.alternatives.intersection(terms))
        for phrase in self.phrases:
            if phrase in text.lower():
                matched.update(stemmed_words(phrase))
        return matched


def query_groups(query: str) -> tuple[ParsedQuery | None, list[QueryGroup]]:
    try:
        parsed = parse_query(query)
    except EmptyQuery:
        return None, []
    terms = list(dict.fromkeys(term for term in parsed.terms if term not in _QUESTION_STEMS))[:_MAX_TERMS]
    return parsed, [QueryGroup(term, _ALIASES.get(term, frozenset({term})), phrases=_ALIAS_PHRASES.get(term, ())) for term in terms]


def _one_edit(left: str, right: str) -> bool:
    if left == right or abs(len(left) - len(right)) > 1:
        return False
    if len(left) == len(right):
        differences = [i for i, (a, b) in enumerate(zip(left, right)) if a != b]
        return len(differences) == 1 or (len(differences) == 2
            and differences[1] == differences[0] + 1
            and left[differences[0]] == right[differences[1]]
            and left[differences[1]] == right[differences[0]])
    shorter, longer = (left, right) if len(left) < len(right) else (right, left)
    index = next((i for i, (a, b) in enumerate(zip(shorter, longer)) if a != b), len(shorter))
    return shorter[index:] == longer[index + 1:]


class TypoResolver:
    """Keep at most two candidate stems per query term, regardless of corpus size."""
    def __init__(self, groups: list[QueryGroup]) -> None:
        self.groups = groups
        self.existing: set[str] = set()
        self.candidates: dict[str, dict[str, tuple[int, int]]] = {group.term: {} for group in groups if len(group.term) >= 5}

    def observe(self, words: Iterable[str], document: int, text: str = "") -> None:
        vocabulary = set(words)
        for group in self.groups:
            if group.matches(vocabulary, text):
                self.existing.add(group.term)
            candidates = self.candidates.get(group.term)
            if candidates is None or group.term in self.existing:
                continue
            for word in vocabulary:
                if len(word) < 5 or not _one_edit(group.term, word):
                    continue
                if word in candidates:
                    count, last = candidates[word]
                    if last != document:
                        candidates[word] = (count + 1, document)
                elif len(candidates) < 2:
                    candidates[word] = (1, document)

    def resolve(self) -> list[QueryGroup]:
        groups = []
        for group in self.groups:
            candidates = self.candidates.get(group.term, {})
            if group.term not in self.existing and len(candidates) == 1:
                groups.append(QueryGroup(group.term, frozenset(candidates), corrected=True))
            else:
                groups.append(group)
        return groups

    def document_frequency(self, term: str) -> int:
        return max((count for count, _ in self.candidates.get(term, {}).values()), default=0)


def _chunks(store: Store, notebook_id: str, source_id: str) -> Iterator[Chunk]:
    offset = 0
    while True:
        page = store.get_source_chunks_page(notebook_id, source_id, offset=offset, limit=64)
        if not page or not page[1]:
            return
        yield from page[1]
        offset += len(page[1])


def _snippet(text: str, matched: set[str]) -> str:
    import re
    position = next((match.start() for match in re.finditer(r"[a-z0-9']+", text.lower())
                     if stem(match.group()) in matched), 0)
    start = max(0, position - 80)
    return ("…" if start else "") + text[start:start + 280].strip() + ("…" if start + 280 < len(text) else "")


def related_search(store: Store, notebook_id: str, query: str, *, kind: str | None = None,
                   source_ids: list[str] | None = None, tags: list[str] | None = None,
                   limit: int = 10, offset: int = 0) -> tuple[list[SearchHit], int]:
    parsed, groups = query_groups(query)
    if parsed is None or (not groups and not parsed.phrases):
        return [], 0
    ids, wanted_tags = set(source_ids or []), set(tags or [])
    summaries = [source for source in store.list_sources(notebook_id)
                 if (not kind or source.kind == kind) and (not ids or source.id in ids)
                 and (not wanted_tags or wanted_tags.intersection(source.tags))]
    resolver = TypoResolver(groups)
    for order, source in enumerate(summaries):
        for chunk in _chunks(store, notebook_id, source.id):
            resolver.observe(stemmed_words(chunk.text), order, chunk.text)
    groups = resolver.resolve()
    heap: list[tuple[float, int, int, int, SearchHit]] = []
    total = 0
    capacity = max(0, offset) + max(0, limit)
    for order, source in enumerate(summaries):
        # Hash-only bookkeeping: result text is retained only for the requested page.
        seen: set[tuple[tuple[int, ...], bytes]] = set()
        for chunk in _chunks(store, notebook_id, source.id):
            lower = chunk.text.lower()
            if any(phrase not in lower for phrase in parsed.phrases):
                continue
            counts = Counter(stemmed_words(chunk.text))
            matched: set[str] = set()
            score = 0.0
            for group in groups:
                found = group.matches(counts, chunk.text)
                if not found:
                    continue
                matched.update(found)
                confidence = 10 if group.corrected else 1000 if group.term in found else 100
                score += confidence + min(3, math.log1p(sum(counts[word] for word in found)))
            if not matched and not parsed.phrases:
                continue
            score += PHRASE_BONUS * sum(lower.count(phrase) for phrase in parsed.phrases)
            snippet = _snippet(chunk.text, matched)
            key = (tuple(chunk.pages), hashlib.sha256(snippet.encode()).digest())
            if key in seen:
                continue
            seen.add(key)
            total += 1
            hit = SearchHit(source_id=source.id, source_title=source.title, pages=chunk.pages,
                            score=score, snippet=snippet, matched_terms=sorted(matched))
            entry = (score, -order, -chunk.seq, -total, hit)
            if len(heap) < capacity:
                heapq.heappush(heap, entry)
            elif capacity and entry[:4] > heap[0][:4]:
                heapq.heapreplace(heap, entry)
    ordered = [entry[4] for entry in sorted(heap, key=lambda item: item[:4], reverse=True)]
    return ordered[max(0, offset):max(0, offset) + max(0, limit)], total
