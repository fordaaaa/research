from __future__ import annotations

from core.article import ArticleParagraph
from core.keypassages import rank_key_passages


def test_ranking_is_explainable_stable_and_top_k():
    passages = [
        ArticleParagraph("The river system carries water to farms.", "Overview", 0),
        ArticleParagraph("River river river river river river.", "Overview", 1),
        ArticleParagraph("The river system supports farms and wildlife.", "Overview", 2),
    ]
    ranked = rank_key_passages(passages, top_k=2)

    assert len(ranked) == 2
    assert ranked[0].passage.text != passages[1].text
    assert ranked[0].score >= ranked[1].score
    assert set(ranked[0].components) == {"centrality", "heading_overlap", "position", "length"}
    assert rank_key_passages(passages, top_k=2) == ranked


def test_ranking_handles_empty_and_short_inputs():
    assert rank_key_passages([], top_k=3) == []
    assert rank_key_passages(["A short passage."], top_k=0) == []
    ranked = rank_key_passages(["A short passage."], top_k=3)
    assert ranked[0].passage.text == "A short passage."
