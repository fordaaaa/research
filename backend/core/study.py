"""Keyless study helpers: key-term extraction, study guides, mind maps.

Everything here is deterministic term-frequency work over the notebook's own
chunks — no provider, no key, no network.
"""
from __future__ import annotations

import re
from collections import Counter

from core.models import Chunk, Flashcard, Source, utcnow
from core.search import stem, stemmed_words

_STOPWORDS = frozenset(
    {
        "the", "a", "an", "and", "or", "for", "with", "how", "what", "why",
        "are", "is", "its", "their", "from", "that", "this", "into", "your",
        "you", "can", "was", "were", "has", "have", "had", "been", "being",
        "will", "would", "should", "could", "which", "when", "where", "who",
        "whom", "there", "they", "them", "then", "than", "also", "such",
        "more", "most", "some", "any", "each", "other", "these", "those",
        "about", "after", "before", "between", "during", "through", "under",
        "over", "again", "once", "here", "out", "off", "own", "same", "too",
        "very", "just", "like", "because", "while", "both", "few", "many",
    }
)

_TOKEN = re.compile(r"[a-z0-9]+")


def _terms(text: str) -> list[str]:
    return [
        token
        for token in stemmed_words(text)
        if len(token) >= 4 and token not in _STOPWORDS and not token.isdigit()
    ]


def key_terms(sources: list[Source], top_n: int = 12) -> list[tuple[str, int]]:
    """Most frequent content terms across all chunks, with raw counts."""
    counts: Counter[str] = Counter()
    for source in sources:
        for chunk in source.chunks:
            counts.update(_terms(chunk.text))
    return counts.most_common(top_n)


def source_terms(source: Source, top_n: int = 5) -> list[str]:
    counts: Counter[str] = Counter()
    for chunk in source.chunks:
        counts.update(_terms(chunk.text))
    return [term for term, _ in counts.most_common(top_n)]


_SURFACE_TOKEN = re.compile(r"[A-Za-z0-9']+")


def _surface_in_text(text: str, term: str) -> str:
    """First original word in text whose stem matches term (stem-normalized).

    Keeps stems for ranking/matching internally; user-facing output uses the
    returned surface form so stems such as "photosynthesi" never leak.
    """
    want = stem(term)
    for match in _SURFACE_TOKEN.finditer(text):
        if stem(match.group(0)) == want:
            return match.group(0)
    return ""


def _display_for_source(stem_term: str, source: Source) -> str:
    """First surface form for stem_term found in source chunks, in order."""
    for chunk in source.chunks:
        surface = _surface_in_text(chunk.text, stem_term)
        if surface:
            return surface
    return ""


def _display_for_sources(stem_term: str, sources: list[Source]) -> str:
    """First surface form for stem_term across sources, in order."""
    for source in sources:
        surface = _display_for_source(stem_term, source)
        if surface:
            return surface
    return ""


def build_study_guide(notebook_name: str, sources: list[Source]) -> str:
    """One-page markdown guide: key terms, per-source points, self-test prompts."""
    terms = key_terms(sources)
    labels: list[str] = []
    for stem_term, _ in terms:
        surface = _display_for_sources(stem_term, sources)
        if surface:
            labels.append(surface)
    lines = [f"# Study guide: {notebook_name}", ""]
    if labels:
        lines.append("## Key terms")
        lines.extend(f"- **{label}**" for label in labels)
        lines.append("")
    lines.append("## What each source covers")
    for number, source in enumerate(sources, start=1):
        lines.append(f"### {number}. {source.title}")
        seen = 0
        for chunk in source.chunks[:2]:
            text = " ".join(chunk.text.split())
            if text:
                lines.append(f"- {text[:280]}{'…' if len(text) > 280 else ''}")
                seen += 1
                if seen >= 2:
                    break
        lines.append("")
    if labels:
        lines.append("## Self-test")
        lines.extend(f"- Define **{label}** in your own words." for label in labels[:6])
        lines.append("")
    lines.append(f"_Built from {len(sources)} source{'s' if len(sources) != 1 else ''} on this machine — no AI involved._")
    return "\n".join(lines).rstrip()


def build_mindmap(notebook_name: str, sources: list[Source]) -> dict:
    """Notebook → sources → key-terms tree for the collapsible map UI."""
    children = []
    for source in sources:
        leaves = []
        for stem_term in source_terms(source):
            surface = _display_for_source(stem_term, source)
            if surface:
                leaves.append({"name": surface})
        children.append({"name": source.title, "children": leaves})
    return {"name": notebook_name, "children": children}


def mindmap_markdown(tree: dict) -> str:
    lines = [f"# {tree['name']}", ""]
    for branch in tree.get("children", []):
        lines.append(f"- {branch['name']}")
        for leaf in branch.get("children", []):
            lines.append(f"  - {leaf['name']}")
    return "\n".join(lines).rstrip() + "\n"


def schedule_review(card: Flashcard, rating: str, now=None) -> Flashcard:
    """Deterministic spaced-review step: again resets, hard/good/easy grow."""
    from datetime import timedelta

    moment = now or utcnow()
    interval = card.interval_days or 0.0
    if rating == "again":
        card.interval_days = 0.0
    elif rating == "hard":
        card.interval_days = 1.0 if interval <= 0 else round(interval * 1.2, 4)
    elif rating == "good":
        card.interval_days = 2.0 if interval <= 0 else round(interval * 2.0, 4)
    elif rating == "easy":
        card.interval_days = 4.0 if interval <= 0 else round(interval * 2.5, 4)
    else:
        raise ValueError(f"unknown rating: {rating}")
    card.review_count += 1
    card.last_reviewed_at = moment
    card.updated_at = moment
    card.due_at = moment + timedelta(days=card.interval_days)
    return card


_SENTENCE = re.compile(r"(?<=[.!?])\s+(?=[A-Z0-9])")


def _sentences(text: str) -> list[str]:
    return [s.strip() for s in _SENTENCE.split(" ".join(text.split())) if s.strip()]


def suggest_cards(
    sources: list[Source], existing_fronts: set[str] | None = None, limit: int = 5
) -> list[dict]:
    """Deterministic source-grounded draft cards with provenance.

    Pure term-frequency work over the notebook's own chunks — no AI, no writes.
    One suggestion per (term, chunk): front names the key term, back is the
    grounded sentence, deduplicated by normalized front/back.
    """
    known = {f.strip().lower() for f in (existing_fronts or set())}
    seen: set[str] = set()
    suggestions: list[dict] = []
    for source in sources:
        terms = source_terms(source, top_n=5)
        if not terms:
            continue
        for term in terms:
            stemmed = set(stemmed_words(term))
            for chunk in source.chunks:
                chunk_stems = set(stemmed_words(chunk.text))
                if stemmed and stemmed.isdisjoint(chunk_stems):
                    continue
                excerpt = ""
                for sentence in _sentences(chunk.text):
                    if len(sentence) >= 30:
                        excerpt = sentence[:280]
                        break
                if not excerpt:
                    continue
                display = _surface_in_text(excerpt, term) or _surface_in_text(
                    chunk.text, term
                )
                if not display:
                    continue
                front = f"What is the key point about '{display}' in {source.title}?"
                key = f"{front.strip().lower()}\n{excerpt.strip().lower()}"
                if key in seen or front.strip().lower() in known:
                    continue
                seen.add(key)
                suggestions.append(
                    {
                        "front": front,
                        "back": excerpt,
                        "source_id": source.id,
                        "source_title": source.title,
                        "pages": list(chunk.pages),
                        "chunk_seq": chunk.seq,
                    }
                )
                if len(suggestions) >= limit:
                    return suggestions
                break  # one card per term per source
    return suggestions


def _excerpt_for_term(source: Source, term: str) -> tuple[str, Chunk | None]:
    """First long sentence from the first chunk containing the term stem.

    Shared grounding helper: same chunk/sentence mechanism as suggest_cards.
    """
    wanted = set(stemmed_words(term))
    for chunk in source.chunks:
        if wanted and wanted.isdisjoint(set(stemmed_words(chunk.text))):
            continue
        for sentence in _sentences(chunk.text):
            if len(sentence) >= 30:
                return sentence[:280], chunk
    return "", None


def build_glossary(sources: list[Source], limit: int = 20) -> list[dict]:
    """Deterministic term → grounded excerpt entries with provenance.

    Terms rank by notebook-wide frequency (key_terms order); each entry cites
    the first source/chunk holding the term. Deduplicated by normalized term,
    stable order, capped at limit. No AI, no writes.
    """
    ranked = key_terms(sources, top_n=max(limit * 3, limit + 5))
    seen: set[str] = set()
    seen_display: set[str] = set()
    entries: list[dict] = []
    for term, _count in ranked:
        key = term.strip().lower()
        if not key or key in seen:
            continue
        seen.add(key)
        for source in sources:
            excerpt, chunk = _excerpt_for_term(source, term)
            if excerpt and chunk is not None:
                display = _surface_in_text(excerpt, term) or _surface_in_text(
                    chunk.text, term
                )
                if not display:
                    continue
                display_key = display.strip().lower()
                if not display_key or display_key in seen_display:
                    continue
                seen_display.add(display_key)
                entries.append(
                    {
                        "term": display,
                        "explanation": excerpt,
                        "source_id": source.id,
                        "source_title": source.title,
                        "pages": list(chunk.pages),
                        "chunk_seq": chunk.seq,
                    }
                )
                break
        if len(entries) >= limit:
            break
    return entries


def _surface_form(excerpt: str, term: str) -> str:
    """Original word in the excerpt whose stem matches the glossary term."""
    return _surface_in_text(excerpt, term)


def build_quiz(sources: list[Source], limit: int = 10) -> list[dict]:
    """Deterministic questions derived from the glossary entries.

    Even-index entries become short-answer prompts (answer: grounded excerpt);
    odd-index entries become cloze prompts when the term's surface form can be
    blanked, otherwise short-answer. Same provenance as the glossary entry.
    No AI, no writes.
    """
    questions: list[dict] = []
    for index, entry in enumerate(build_glossary(sources, limit=limit)):
        base = {
            "term": entry["term"],
            "source_id": entry["source_id"],
            "source_title": entry["source_title"],
            "pages": entry["pages"],
            "chunk_seq": entry["chunk_seq"],
        }
        surface = _surface_form(entry["explanation"], entry["term"]) if index % 2 else ""
        if surface:
            prompt = re.sub(
                r"\b" + re.escape(surface) + r"\b",
                "____",
                entry["explanation"],
                count=1,
                flags=re.IGNORECASE,
            )
            if "____" in prompt:
                questions.append(
                    {
                        "question_type": "cloze",
                        "prompt": prompt,
                        "answer": surface,
                        **base,
                    }
                )
                continue
        questions.append(
            {
                "question_type": "short_answer",
                "prompt": (
                    f"In your own words, what does '{entry['term']}' mean"
                    f" as used in {entry['source_title']}?"
                ),
                "answer": entry["explanation"],
                **base,
            }
        )
    return questions
