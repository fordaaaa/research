"""Cited excerpt context builder shared by chat and research synthesis."""
from __future__ import annotations

import heapq
import math
from collections import Counter
from typing import TYPE_CHECKING

from core.models import Citation
from core.search import PHRASE_BONUS, stemmed_words
from core.related import TypoResolver, query_groups

if TYPE_CHECKING:
    from core.store import Store

MAX_CONTEXT = 14_000

_PAGE_BATCH = 64
_RETRIEVAL_TOP_K = 50
_RankedChunk = tuple[float, int, int, str, str, list[int], str, frozenset[str], int]

def build_context(
    store: Store,
    notebook_id: str,
    source_ids: set[str] | None = None,
    query: str | None = None,
) -> tuple[list[str], list[Citation]]:
    """Sequential excerpts by default; query-aware ranking when query is given.

    No-query behavior (used by research/outlines) is unchanged sequential
    pagination via get_source_chunks_page. When query carries useful lexical
    terms, ranked selection surfaces late relevant chunks within the same
    char budget; otherwise a bounded sequential fallback is used.
    """
    if query is None or not query.strip():
        return _sequential(store, notebook_id, source_ids)
    ranked = _ranked(store, notebook_id, source_ids, query)
    if not ranked:
        return _sequential(store, notebook_id, source_ids)
    return ranked


def _sequential(
    store: Store, notebook_id: str, source_ids: set[str] | None
) -> tuple[list[str], list[Citation]]:
    excerpts, citations, size = [], [], 0
    for summary in store.list_sources(notebook_id):
        if source_ids is not None and summary.id not in source_ids:
            continue
        offset = 0
        while True:
            page = store.get_source_chunks_page(
                notebook_id, summary.id, offset=offset, limit=64
            )
            if not page:
                break
            _, chunks = page
            if not chunks:
                break
            for chunk in chunks:
                addition = len(chunk.text)
                if excerpts and size + addition > MAX_CONTEXT:
                    return excerpts, citations
                number = len(citations) + 1
                excerpts.append(f"[{number}] {summary.title}, pages {', '.join(map(str, chunk.pages))}:\n{chunk.text}")
                citations.append(Citation(source_id=summary.id, source_title=summary.title, pages=chunk.pages))
                size += addition
            offset += len(chunks)
    return excerpts, citations


def _ranked(
    store: Store,
    notebook_id: str,
    source_ids: set[str] | None,
    query: str,
) -> tuple[list[str], list[Citation]] | None:
    parsed, groups = query_groups(query)
    terms = [group.term for group in groups]
    phrases = list(parsed.phrases) if parsed else []
    if not terms and not phrases:
        return None
    summaries = [
        summary
        for summary in store.list_sources(notebook_id)
        if source_ids is None or summary.id in source_ids
    ]
    if not summaries:
        return None
    n_docs = len(summaries)
    term_set = set(terms)
    df: dict[str, int] = {term: 0 for term in term_set}
    resolver = TypoResolver(groups)
    for document, summary in enumerate(summaries):
        found: set[str] = set()
        offset = 0
        while True:
            page = store.get_source_chunks_page(
                notebook_id, summary.id, offset=offset, limit=_PAGE_BATCH
            )
            if not page:
                break
            _, chunks = page
            if not chunks:
                break
            for chunk in chunks:
                stems = set(stemmed_words(chunk.text))
                resolver.observe(stems, document, chunk.text)
                for group in groups:
                    if group.matches(stems, chunk.text):
                        found.add(group.term)
                if len(found) == len(term_set):
                    break
            offset += len(chunks)
            if len(found) == len(term_set):
                break
        for term in found:
            df[term] += 1
    groups = resolver.resolve()
    for group in groups:
        if group.corrected:
            df[group.term] = resolver.document_frequency(group.term)
    # Second bounded scan: score chunks, retain only a bounded top-K set.
    heap: list[_RankedChunk] = []
    # Reserve evidence for distinct topics before the global score cutoff.
    # Otherwise many repetitive chunks can evict the other half of a comparison.
    reserved_terms = set(sorted(
        (term for term in term_set if df[term] > 0),
        key=lambda term: (df[term], term),
    )[:_RETRIEVAL_TOP_K])
    topic_best: dict[str, _RankedChunk] = {}
    for order, summary in enumerate(summaries):
        offset = 0
        while True:
            page = store.get_source_chunks_page(
                notebook_id, summary.id, offset=offset, limit=_PAGE_BATCH
            )
            if not page:
                break
            _, chunks = page
            if not chunks:
                break
            for chunk in chunks:
                counts = Counter(stemmed_words(chunk.text))
                matched = frozenset(group.term for group in groups if group.matches(counts, chunk.text))
                lower = chunk.text.lower()
                phrase_hits = 0
                for phrase in phrases:
                    if phrase in lower:
                        phrase_hits += lower.count(phrase)
                if not matched and phrase_hits == 0:
                    continue
                score = 0.0
                for group in groups:
                    term = group.term
                    found = group.matches(counts, chunk.text)
                    if not found:
                        continue
                    df_t = df.get(term, 0)
                    if df_t <= 0:
                        continue
                    idf = math.log1p(n_docs / max(1, df_t))
                    tf = sum(counts[word] for word in found)
                    weight = 1.0 + math.log(tf) if tf > 1 else 1.0
                    confidence = 1.0 if term in found else 0.45 if group.corrected else 0.7
                    score += idf * weight * confidence
                if phrase_hits:
                    score += PHRASE_BONUS * phrase_hits
                if score <= 0:
                    continue
                entry = (
                    score,
                    order,
                    chunk.seq,
                    summary.id,
                    summary.title,
                    list(chunk.pages),
                    chunk.text,
                    matched,
                    phrase_hits,
                )
                for term in matched & reserved_terms:
                    previous = topic_best.get(term)
                    if previous is None or score > previous[0]:
                        topic_best[term] = entry
                if len(heap) < _RETRIEVAL_TOP_K:
                    heapq.heappush(heap, entry)
                elif score > heap[0][0]:
                    heapq.heapreplace(heap, entry)
            offset += len(chunks)
    if not heap:
        return None
    # At most 50 global candidates plus 50 topic representatives were retained.
    # Give representatives space, then fill the final 50-candidate pool by score.
    candidates: dict[tuple[str, int], _RankedChunk] = {
        (entry[3], entry[2]): entry for entry in topic_best.values()
    }
    for entry in sorted(heap, key=lambda e: (-e[0], e[1], e[2])):
        if len(candidates) >= _RETRIEVAL_TOP_K:
            break
        candidates.setdefault((entry[3], entry[2]), entry)
    ranked = sorted(candidates.values(), key=lambda e: (-e[0], e[1], e[2]))
    # Drop generic-only matches when substantive matches exist. A term is
    # discriminative when it is absent from at least one source; chunks that
    # match only ubiquitous terms are omitted only if better exists.
    discriminative = {term for term in terms if 0 < df.get(term, 0) < n_docs}
    if discriminative:
        substantive = [
            entry for entry in ranked if (entry[7] & discriminative) or entry[8] > 0
        ]
        if substantive:
            ranked = substantive
    # Spread budget across sources: round-robin by per-source best so a
    # compare question keeps each relevant source instead of filling from one.
    source_groups: dict[str, list[_RankedChunk]] = {}
    group_order: list[str] = []
    for entry in ranked:
        source_id = entry[3]
        if source_id not in source_groups:
            source_groups[source_id] = []
            group_order.append(source_id)
        source_groups[source_id].append(entry)
    ordered: list[_RankedChunk] = []
    depth = max(len(source_groups[sid]) for sid in group_order)
    for index in range(depth):
        for sid in group_order:
            items = source_groups[sid]
            if index < len(items):
                ordered.append(items[index])
    excerpts: list[str] = []
    citations: list[Citation] = []
    size = 0
    for _, _, _, source_id, title, pages, text, _, _ in ordered:
        number = len(citations) + 1
        excerpt = f"[{number}] {title}, pages {', '.join(map(str, pages))}:\n{text}"
        addition = len(excerpt)
        if excerpts and size + addition > MAX_CONTEXT:
            break
        excerpts.append(excerpt)
        citations.append(Citation(source_id=source_id, source_title=title, pages=list(pages)))
        size += addition
    if not excerpts:
        return None
    return excerpts, citations


def build_note_excerpts(store: Store, notebook_id: str, max_chars: int = 3_000) -> list[str]:
    """Return a bounded set of persisted Markdown note excerpts for prompting."""
    excerpts: list[str] = []
    size = 0
    for summary in store.list_notes(notebook_id):
        note = store.get_note(notebook_id, summary.id)
        if not note:
            continue
        text = f"# {note.title}\n{note.body}".strip()
        if not text:
            continue
        remaining = max_chars - size
        if remaining <= 0:
            break
        excerpts.append(text[:remaining])
        size += min(len(text), remaining)
    return excerpts
