"""Keyless study helpers: key-term extraction, study guides, mind maps.

Everything here is deterministic term-frequency work over the notebook's own
chunks — no provider, no key, no network.
"""
from __future__ import annotations

import re
from collections import Counter

from core.models import Source
from core.search import stemmed_words

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


def build_study_guide(notebook_name: str, sources: list[Source]) -> str:
    """One-page markdown guide: key terms, per-source points, self-test prompts."""
    terms = key_terms(sources)
    lines = [f"# Study guide: {notebook_name}", ""]
    if terms:
        lines.append("## Key terms")
        lines.extend(f"- **{term}**" for term, _ in terms)
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
    if terms:
        lines.append("## Self-test")
        lines.extend(f"- Define **{term}** in your own words." for term, _ in terms[:6])
        lines.append("")
    lines.append(f"_Built from {len(sources)} source{'s' if len(sources) != 1 else ''} on this machine — no AI involved._")
    return "\n".join(lines).rstrip()


def build_mindmap(notebook_name: str, sources: list[Source]) -> dict:
    """Notebook → sources → key-terms tree for the collapsible map UI."""
    return {
        "name": notebook_name,
        "children": [
            {"name": source.title, "children": [{"name": term} for term in source_terms(source)]}
            for source in sources
        ],
    }


def mindmap_markdown(tree: dict) -> str:
    lines = [f"# {tree['name']}", ""]
    for branch in tree.get("children", []):
        lines.append(f"- {branch['name']}")
        for leaf in branch.get("children", []):
            lines.append(f"  - {leaf['name']}")
    return "\n".join(lines).rstrip() + "\n"
