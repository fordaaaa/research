"""Explainable, deterministic ranking of article passages."""
from __future__ import annotations

from collections import Counter
from dataclasses import dataclass
import re
from typing import Sequence

from core.article import ArticleParagraph

_TOKEN = re.compile(r"[a-z0-9]+")


@dataclass(frozen=True)
class RankedPassage:
    passage: ArticleParagraph
    score: float
    components: dict[str, float]


def _tokens(text: str) -> set[str]:
    return set(_TOKEN.findall(text.lower()))


def rank_key_passages(
    passages: Sequence[ArticleParagraph | str],
    query: str = "",
    top_k: int = 5,
) -> list[RankedPassage]:
    """Rank passages using fixed weights: centrality .40, heading .25, position .20, length .15."""
    if top_k <= 0 or not passages:
        return []
    normalized = [p if isinstance(p, ArticleParagraph) else ArticleParagraph(str(p), None, i) for i, p in enumerate(passages)]
    token_sets = [_tokens(p.text) for p in normalized]
    frequencies = Counter(token for tokens in token_sets for token in tokens)
    query_tokens = _tokens(query)
    scored: list[RankedPassage] = []
    total = len(normalized)
    for i, (passage, tokens) in enumerate(zip(normalized, token_sets)):
        words = _TOKEN.findall(passage.text.lower())
        # Reward terms shared across the article, while avoiding a repeated-word
        # sentence winning solely because it repeats one term.
        centrality = (
            sum(frequencies[token] for token in tokens) / max(1, len(tokens) * total)
        ) * min(1.0, len(tokens) / max(1, len(words)))
        heading_tokens = _tokens(passage.heading or "")
        overlap_tokens = query_tokens or set().union(*(t for t in token_sets if t))
        heading_overlap = len(heading_tokens & overlap_tokens) / max(1, len(heading_tokens))
        position = 1.0 - (i / max(1, total - 1))
        length = min(len(passage.text) / 240.0, 1.0)
        components = {"centrality": centrality, "heading_overlap": heading_overlap, "position": position, "length": length}
        score = sum(components[name] * weight for name, weight in (("centrality", .40), ("heading_overlap", .25), ("position", .20), ("length", .15)))
        scored.append(RankedPassage(passage, score, components))
    return sorted(scored, key=lambda item: (-item.score, item.passage.index))[:top_k]


rank_passages = rank_key_passages
