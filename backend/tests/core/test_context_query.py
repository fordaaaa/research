"""Query-aware cited context selection regressions.

Sequential build_context fills MAX_CONTEXT from the oldest chunks, so a
relevant late source past the 14k budget is invisible to chat. Query-aware
selection must surface late evidence, tolerate noisy natural-language
questions, include both sides of compare questions, and omit unrelated
distractors — all via bounded get_source_chunks_page scans without full
get_source hydration.
"""
from __future__ import annotations

from core import ingest
from core.context import MAX_CONTEXT, build_context
from core.models import Chunk, Page, Source, utcnow
from core.store import Store, new_id


def _store(tmp_path) -> Store:
    store = Store(root=tmp_path / "data")
    store._test_uid = store.create_user(f"u{new_id()}@example.com", "password123").id
    return store


FILLER_ONE = "Filler one lorem ipsum dolor sit amet consectetur adipiscing elit alpha. " * 150
FILLER_TWO = "Filler two lorem ipsum dolor sit amet consectetur adipiscing elit beta. " * 150
LATE_MARKER = "ZEPHYR_QUANTUM_PHOTOSYNTHESIS_MARKER"
LATE_TEXT = (
    f"Late discovery details {LATE_MARKER} quantum photosynthesis breakthrough zephyr unfolding. " * 20
)


def _notebook_with_filler_then_late(store: Store):
    nb = store.create_notebook(store._test_uid, "CtxQuery")
    ingest.ingest_text(store, nb.id, "Filler One", FILLER_ONE)
    ingest.ingest_text(store, nb.id, "Filler Two", FILLER_TWO)
    late = ingest.ingest_text(store, nb.id, "Late Discovery", LATE_TEXT)
    return nb, late


def test_query_selects_late_source_past_sequential_budget(tmp_path):
    store = _store(tmp_path)
    nb, late = _notebook_with_filler_then_late(store)
    # Sanity: sequential budget misses the late source entirely.
    seq_excerpts, _ = build_context(store, nb.id)
    assert seq_excerpts
    assert LATE_MARKER not in "\n".join(seq_excerpts)

    excerpts, citations = build_context(store, nb.id, query="What is zephyr quantum photosynthesis breakthrough?")
    joined = "\n".join(excerpts)
    assert LATE_MARKER in joined
    assert any(c.source_id == late.id for c in citations)


def test_natural_language_question_with_unmatched_terms_still_retrieves(tmp_path):
    store = _store(tmp_path)
    nb, _ = _notebook_with_filler_then_late(store)
    question = (
        "Could you kindly explain in simple terms what zephyr quantum does blorple wobble?"
    )
    excerpts, _ = build_context(store, nb.id, query=question)
    assert LATE_MARKER in "\n".join(excerpts)


def test_compare_mitosis_meiosis_includes_both_sources(tmp_path):
    store = _store(tmp_path)
    nb = store.create_notebook(store._test_uid, "Compare")
    mitosis_text = "Mitosis prophase metaphase anaphase telophase cell division stages. " * 250
    meiosis_text = (
        "Meiosis haploid gamete formation reduction division MEIOSIS_HAPLOID_MARKER. " * 5
    )
    mitosis = ingest.ingest_text(store, nb.id, "Mitosis Notes", mitosis_text)
    meiosis = ingest.ingest_text(store, nb.id, "Meiosis Notes", meiosis_text)
    # Sequential alone fills the budget with the first (large) source.
    seq_excerpts, _ = build_context(store, nb.id)
    assert "MEIOSIS_HAPLOID_MARKER" not in "\n".join(seq_excerpts)

    excerpts, citations = build_context(
        store, nb.id, query="Compare mitosis and meiosis differences"
    )
    joined = "\n".join(excerpts)
    assert "Mitosis" in joined or "mitosis" in joined.lower()
    assert "MEIOSIS_HAPLOID_MARKER" in joined
    titles = {c.source_title for c in citations}
    assert "Mitosis Notes" in titles
    assert "Meiosis Notes" in titles
    assert {c.source_id for c in citations} == {mitosis.id, meiosis.id}


def test_comparison_keeps_short_evidence_after_a_long_repetitive_source(tmp_path):
    store = _store(tmp_path)
    nb = store.create_notebook(store._test_uid, "Long comparison")
    text = "Mitosis phases produce identical daughter cells. " * 24
    mitosis = store.create_source(Source(
        id=new_id(), notebook_id=nb.id, kind="pdf", title="Mitosis textbook",
        created_at=utcnow(),
        pages=[Page(number=i + 1, text=text) for i in range(80)],
        chunks=[Chunk(seq=i, pages=[i + 1], text=text) for i in range(80)],
    ))
    meiosis = ingest.ingest_text(
        store, nb.id, "Meiosis handout", "Meiosis produces four haploid cells."
    )

    excerpts, citations = build_context(store, nb.id, query="Compare mitosis and meiosis phases")

    assert {c.source_id for c in citations} == {mitosis.id, meiosis.id}
    assert "Meiosis produces four haploid cells." in "\n".join(excerpts)
    assert sum(map(len, excerpts)) <= MAX_CONTEXT


def test_irrelevant_distractor_omitted_when_matches_exist(tmp_path):
    store = _store(tmp_path)
    nb = store.create_notebook(store._test_uid, "Distractor")
    ingest.ingest_text(
        store, nb.id, "Relevant", "Mitochondria make energy for cells MITO_MARKER."
    )
    ingest.ingest_text(
        store,
        nb.id,
        "Distractor",
        "Shakespeare sonnets shall compare thee to a summer day SHAKESPEARE_DISTRACTOR.",
    )
    excerpts, citations = build_context(store, nb.id, query="mitochondria energy")
    joined = "\n".join(excerpts)
    assert "MITO_MARKER" in joined
    assert "SHAKESPEARE_DISTRACTOR" not in joined
    assert all(c.source_title != "Distractor" for c in citations)


def test_no_query_and_filter_behavior_unchanged(tmp_path):
    store = _store(tmp_path)
    nb = store.create_notebook(store._test_uid, "Filter")
    first = ingest.ingest_text(store, nb.id, "Alpha", "Mitochondria make energy.")
    ingest.ingest_text(store, nb.id, "Beta", "Chlorophyll captures light.")
    excerpts, citations = build_context(store, nb.id)
    assert len(excerpts) == 2
    assert excerpts[0].startswith("[1] Alpha, pages ")
    # source_ids filter still respected without a query.
    filtered, filtered_citations = build_context(store, nb.id, source_ids={first.id})
    assert len(filtered) == 1
    assert "Mitochondria" in filtered[0]
    assert filtered_citations[0].source_id == first.id
    # Empty query string behaves like no query (sequential).
    empty_q, _ = build_context(store, nb.id, query="   ")
    assert [e for e in empty_q] == [e for e in excerpts]


def test_query_path_avoids_full_hydration(tmp_path, monkeypatch):
    store = _store(tmp_path)
    nb, _ = _notebook_with_filler_then_late(store)

    def _boom(*args, **kwargs):
        raise AssertionError("full source hydration must not happen")

    monkeypatch.setattr(Store, "get_source", _boom)
    excerpts, citations = build_context(store, nb.id, query="zephyr quantum photosynthesis")
    assert excerpts
    assert citations
    assert LATE_MARKER in "\n".join(excerpts)


def test_query_output_bounded_with_accurate_numbering(tmp_path):
    store = _store(tmp_path)
    nb = store.create_notebook(store._test_uid, "Bounded")
    for i in range(4):
        ingest.ingest_text(
            store,
            nb.id,
            f"Source {i}",
            f"Mitochondria energy cell process marker COMMON_{i} " * 100,
        )
    excerpts, citations = build_context(store, nb.id, query="mitochondria energy cell")
    assert excerpts
    assert len(excerpts) == len(citations)
    for number, excerpt in enumerate(excerpts, start=1):
        assert excerpt.startswith(f"[{number}] ")
    # Ordinary chunks fit the strict budget including headers.
    assert sum(len(e) for e in excerpts) <= MAX_CONTEXT
    # Citations are 1:1 with excerpts and preserve pages.
    for excerpt, citation in zip(excerpts, citations):
        assert citation.source_title in excerpt
        assert str(citation.pages[0]) in excerpt
        # Original complete chunk text preserved after the header line.
        assert "\n" in excerpt
        body = excerpt.split("\n", 1)[1]
        assert len(body.strip()) > 0
