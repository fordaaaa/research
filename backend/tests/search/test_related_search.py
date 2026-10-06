"""Bounded keyless RELATED search + shared expansion for AI context (RED first).

Strict keyword search stays exact (AND, literal phrases). related=True is a
separate opt-in relevance mode: partial OR coverage, a small conservative
synonym/acronym set, unique single-edit typo correction for long unmatched
tokens, literal quoted phrases, paged chunk access only, bounded heap retention
for the requested page with correct total-after-dedup, and matched_terms that
name only words actually present in the source chunk.

Context shares only the expansion groups: natural wording (powerhouse, DNA)
must surface late evidence without breaking sequential no-query behavior,
comparison representatives, char budgets, or strict AND search.
"""
from __future__ import annotations

from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from core import ingest
from core.models import Chunk, Page, Source, utcnow
from core.store import Store, new_id


def _store(tmp_path: Path) -> Store:
    store = Store(root=tmp_path / "data")
    store._test_uid = store.create_user(f"u{new_id()}@example.com", "password123").id
    return store


def _related(store: Store, nb_id: str, q: str, **kw):
    from core.related import related_search

    return related_search(store, nb_id, q, **kw)


# ---------- natural wording / acronym via conservative groups ----------

def test_related_natural_powerhouse_finds_mitochondria_without_inventing_terms(tmp_path):
    store = _store(tmp_path)
    nb = store.create_notebook(store._test_uid, "Bio")
    ingest.ingest_text(store, nb.id, "Lecture", "Mitochondria produce energy for cells.")
    # Strict AND has no powerhouse token, so nothing.
    assert store.search(nb.id, "powerhouse") == []
    hits, total = _related(store, nb.id, "powerhouse")
    assert total == 1 and len(hits) == 1
    assert hits[0].source_title == "Lecture"
    # matched_terms must name the actual source word, never the query word.
    assert "mitochondria" in hits[0].matched_terms
    assert "powerhouse" not in hits[0].matched_terms


def test_related_acronym_dna_finds_deoxyribonucleic(tmp_path):
    store = _store(tmp_path)
    nb = store.create_notebook(store._test_uid, "Genetics")
    ingest.ingest_text(
        store, nb.id, "Genes", "Deoxyribonucleic acid stores genetic information."
    )
    assert store.search(nb.id, "dna") == []
    hits, total = _related(store, nb.id, "dna")
    assert total >= 1
    assert any("deoxyribonucleic" in h.matched_terms for h in hits)
    assert all("dna" not in h.matched_terms for h in hits)


def test_related_natural_question_partial_coverage_beats_strict_and(tmp_path):
    store = _store(tmp_path)
    nb = store.create_notebook(store._test_uid, "Bio")
    ingest.ingest_text(
        store, nb.id, "Plant notes", "Photosynthesis captures sunlight in leaves."
    )
    q = "How does photosynthesis convert sunlight into energy?"
    assert store.search(nb.id, q) == []
    hits, total = _related(store, nb.id, q)
    assert total >= 1
    assert hits[0].source_title == "Plant notes"


# ---------- typo: unique correction vs ambiguous / short / quoted ----------

def test_related_unique_single_edit_typo_corrects_long_token(tmp_path):
    store = _store(tmp_path)
    nb = store.create_notebook(store._test_uid, "Typo")
    ingest.ingest_text(store, nb.id, "Plant", "Photosynthesis drives plant growth.")
    assert store.search(nb.id, "photosyntesis steps") == []
    hits, total = _related(store, nb.id, "photosyntesis steps")
    assert total >= 1
    assert any("photosynthesi" in h.matched_terms for h in hits)
    # Never invent the misspelling.
    assert all("photosyntesi" not in h.matched_terms for h in hits)


def test_related_ambiguous_typo_does_not_correct(tmp_path):
    store = _store(tmp_path)
    nb = store.create_notebook(store._test_uid, "Ambig")
    # Two vocab words both one edit from the query token abcdefgj.
    ingest.ingest_text(store, nb.id, "A", "abcdefgh appears here.")
    ingest.ingest_text(store, nb.id, "B", "abcdefgi appears here.")
    hits, total = _related(store, nb.id, "abcdefgj")
    assert (hits, total) == ([], 0)


def test_related_short_tokens_never_typo_corrected(tmp_path):
    store = _store(tmp_path)
    nb = store.create_notebook(store._test_uid, "Short")
    ingest.ingest_text(store, nb.id, "A", "Cells divide daily.")
    hits, total = _related(store, nb.id, "cel")
    # cel is short; prefix fallback in strict may fire, but RELATED must not
    # invent a typo correction for short tokens.
    assert (hits, total) == ([], 0)


def test_related_quoted_phrase_stays_literal_no_typo_no_expansion(tmp_path):
    store = _store(tmp_path)
    nb = store.create_notebook(store._test_uid, "Literal")
    ingest.ingest_text(store, nb.id, "Lecture", "Mitochondria produce energy.")
    ingest.ingest_text(
        store, nb.id, "Phrase", "The powerhouse of the cell produces energy."
    )
    # Unquoted powerhouse expands to mitochondria, so both sources match.
    hits, _ = _related(store, nb.id, "powerhouse")
    assert {h.source_title for h in hits} == {"Lecture", "Phrase"}
    # Quoted phrase is literal: only the phrase source matches.
    qhits, qtotal = _related(store, nb.id, '"powerhouse of the cell"')
    assert qtotal == 1 and qhits[0].source_title == "Phrase"
    # Quoted typo stays literal: no correction inside quotes.
    thits, ttotal = _related(store, nb.id, '"photosyntesis"')
    assert (thits, ttotal) == ([], 0)


# ---------- ranking: exact above expansion; mitosis/meiosis distinguished ----------

def test_related_exact_ranks_above_expansion(tmp_path):
    store = _store(tmp_path)
    nb = store.create_notebook(store._test_uid, "Rank")
    ingest.ingest_text(store, nb.id, "Exact", "Mitochondria produce energy.")
    ingest.ingest_text(store, nb.id, "Expanded", "The powerhouse produces energy.")
    hits, total = _related(store, nb.id, "mitochondria")
    assert total == 2
    assert hits[0].source_title == "Exact"
    assert hits[0].score > hits[1].score


def test_related_distinguishes_mitosis_meiosis(tmp_path):
    store = _store(tmp_path)
    nb = store.create_notebook(store._test_uid, "Division")
    ingest.ingest_text(store, nb.id, "Mitosis", "Mitosis phases produce identical cells.")
    ingest.ingest_text(store, nb.id, "Meiosis", "Meiosis produces haploid cells.")
    mhits, mtotal = _related(store, nb.id, "mitosis")
    assert mtotal == 1 and mhits[0].source_title == "Mitosis"
    ehits, etotal = _related(store, nb.id, "meiosis")
    assert etotal == 1 and ehits[0].source_title == "Meiosis"
    # Comparison retrieves both via OR.
    chits, ctotal = _related(store, nb.id, "Compare mitosis and meiosis phases")
    assert ctotal == 2
    assert {h.source_title for h in chits} == {"Mitosis", "Meiosis"}


def test_related_unrelated_query_and_no_match_empty(tmp_path):
    store = _store(tmp_path)
    nb = store.create_notebook(store._test_uid, "Bio")
    ingest.ingest_text(store, nb.id, "Lecture", "Mitochondria produce energy.")
    hits, total = _related(store, nb.id, "Shakespeare sonnets summer day")
    assert (hits, total) == ([], 0)
    hits2, total2 = _related(store, nb.id, "   ")
    assert (hits2, total2) == ([], 0)


# ---------- filters / pagination / total / dedupe / provenance / bounded ----------

def test_related_filters_pagination_total_dedupe_and_provenance(tmp_path):
    store = _store(tmp_path)
    nb = store.create_notebook(store._test_uid, "Paging")
    for i in range(5):
        ingest.ingest_text(store, nb.id, f"src{i}", f"shared term elephant {i}")
    full, full_total = _related(store, nb.id, "elephant", limit=100, offset=0)
    assert full_total == 5 and len(full) == 5
    page, total = _related(store, nb.id, "elephant", limit=2, offset=2)
    assert total == full_total == 5
    assert page == full[2:4]
    # Correct page provenance from Chunk.pages, not invented.
    for h in full:
        assert h.pages and all(isinstance(p, int) for p in h.pages)

    # kind / source / tag filters use summaries only.
    store.create_source(
        Source(
            id=new_id(), notebook_id=nb.id, kind="pdf", title="Paper",
            tags=["bio"], created_at=utcnow(),
            pages=[Page(number=7, text="elephant paper")],
            chunks=[Chunk(seq=0, pages=[7], text="elephant paper")],
        )
    )
    khits, ktotal = _related(store, nb.id, "elephant", kind="pdf")
    assert ktotal == 1 and khits[0].pages == [7]
    only = full[0].source_id
    shits, _ = _related(store, nb.id, "elephant", source_ids=[only])
    assert shits and all(h.source_id == only for h in shits)
    thits, _ = _related(store, nb.id, "elephant paper", tags=["bio"])
    assert thits and all(h.source_title == "Paper" for h in thits)

    # Dedupe identical rows: same text+pages collapse to one.
    nb2 = store.create_notebook(store._test_uid, "Dedupe")
    text = "mitochondria produce energy powerhouse"
    store.create_source(
        Source(
            id=new_id(), notebook_id=nb2.id, kind="paste", title="Dup",
            tags=[], created_at=utcnow(),
            pages=[Page(number=1, text=text)],
            chunks=[
                Chunk(seq=0, pages=[1], text=text),
                Chunk(seq=1, pages=[1], text=text),
            ],
        )
    )
    dhits, dtotal = _related(store, nb2.id, "mitochondria energy")
    assert dtotal == 1 and len(dhits) == 1


def test_related_avoids_full_hydration(tmp_path, monkeypatch):
    store = _store(tmp_path)
    nb = store.create_notebook(store._test_uid, "NoHydrate")
    ingest.ingest_text(store, nb.id, "Lecture", "Mitochondria produce energy.")

    def _boom(*args, **kwargs):
        raise AssertionError("full source hydration must not happen")

    monkeypatch.setattr(Store, "get_source", _boom)
    hits, total = _related(store, nb.id, "mitochondria")
    assert total >= 1 and hits


def test_related_endpoint_flag_defaults_strict_and_cross_user_404(
    client: TestClient,
) -> None:
    nb = client.post("/api/notebooks", json={"name": "Related"}).json()
    client.post(
        f"/api/notebooks/{nb['id']}/sources/text",
        json={"title": "Lecture", "text": "Mitochondria produce energy for cells."},
    )
    # Default stays strict: powerhouse has no literal hit.
    strict = client.get(f"/api/notebooks/{nb['id']}/search", params={"q": "powerhouse"})
    assert strict.status_code == 200
    assert strict.json() == []
    # Opt-in related finds it via expansion.
    rel = client.get(
        f"/api/notebooks/{nb['id']}/search",
        params={"q": "powerhouse", "related": "true"},
    )
    assert rel.status_code == 200
    body = rel.json()
    assert len(body) == 1 and body[0]["source_title"] == "Lecture"
    assert "mitochondria" in body[0]["matched_terms"]
    assert int(rel.headers["X-Search-Total"]) == 1

    from fastapi.testclient import TestClient as TC

    from api.main import app

    with TC(app) as anon:
        rr = anon.post(
            "/api/auth/register",
            json={"email": "stranger-related@example.com", "password": "password123"},
        )
        assert rr.status_code == 201
        token2 = rr.json()["token"]
    with TC(app, headers={"Authorization": f"Bearer {token2}"}) as other:
        r = other.get(
            f"/api/notebooks/{nb['id']}/search",
            params={"q": "powerhouse", "related": "true"},
        )
        assert r.status_code == 404


# ---------- shared expansion improves AI context without breaking contracts ----------

def test_context_expansion_surfaces_powerhouse_paraphrase(tmp_path):
    from core.context import MAX_CONTEXT, build_context

    store = _store(tmp_path)
    nb = store.create_notebook(store._test_uid, "CtxExpand")
    ingest.ingest_text(store, nb.id, "Filler", "Filler lorem ipsum dolor. " * 400)
    late = ingest.ingest_text(
        store, nb.id, "Late", "Mitochondria produce energy for cells MITO_CTX_MARKER."
    )
    excerpts, citations = build_context(store, nb.id, query="Why is the powerhouse important?")
    joined = "\n".join(excerpts)
    assert "MITO_CTX_MARKER" in joined
    assert any(c.source_id == late.id for c in citations)
    assert sum(len(e) for e in excerpts) <= MAX_CONTEXT


def test_context_expansion_acronym_and_sequential_preserved(tmp_path):
    from core.context import build_context

    store = _store(tmp_path)
    nb = store.create_notebook(store._test_uid, "CtxDNA")
    ingest.ingest_text(store, nb.id, "Alpha", "Mitochondria make energy.")
    ingest.ingest_text(store, nb.id, "Beta", "Chlorophyll captures light.")
    seq, _ = build_context(store, nb.id)
    assert len(seq) == 2 and seq[0].startswith("[1] Alpha, pages ")
    # No-query sequential unchanged; empty query falls back to sequential.
    empty, _ = build_context(store, nb.id, query="   ")
    assert empty == seq

    nb2 = store.create_notebook(store._test_uid, "CtxAcro")
    gene = ingest.ingest_text(
        store, nb2.id, "Genes", "Deoxyribonucleic acid stores information GENE_CTX_MARKER."
    )
    excerpts, citations = build_context(store, nb2.id, query="What does DNA do?")
    assert "GENE_CTX_MARKER" in "\n".join(excerpts)
    assert any(c.source_id == gene.id for c in citations)


def test_atp_alias_requires_adenosine_not_any_triphosphate(tmp_path):
    store = _store(tmp_path)
    nb = store.create_notebook(store._test_uid, "Nucleotides")
    ingest.ingest_text(store, nb.id, "ATP material", "Adenosine triphosphate provides energy for cells.")
    ingest.ingest_text(store, nb.id, "Different nucleotide", "Guanosine triphosphate has other cellular roles.")
    hits, total = _related(store, nb.id, "ATP")
    assert total == 1
    assert hits[0].source_title == "ATP material"


def test_context_ambiguous_typo_does_not_promote_either_candidate(tmp_path):
    from core.context import build_context
    store = _store(tmp_path)
    nb = store.create_notebook(store._test_uid, "Ambiguous context")
    ingest.ingest_text(store, nb.id, "Intro", "Notebook introduction with no ambiguous words.")
    ingest.ingest_text(store, nb.id, "Candidate A", "abcdefgh appears here.")
    ingest.ingest_text(store, nb.id, "Candidate B", "abcdefgi appears here.")
    # Preserve the established sequential fallback when no grounded match exists.
    expected = build_context(store, nb.id)
    assert build_context(store, nb.id, query="abcdefgj") == expected
