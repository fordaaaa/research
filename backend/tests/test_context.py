from core import ingest
from core.context import MAX_CONTEXT, build_context
from core.models import utcnow
from core.store import Store, new_id


def _store(tmp_path) -> Store:
    store = Store(root=tmp_path / "data")
    store._test_uid = store.create_user(f"u{new_id()}@example.com", "password123").id
    return store


def test_build_context_avoids_full_hydration(tmp_path, monkeypatch):
    store = _store(tmp_path)
    nb = store.create_notebook(store._test_uid, "Ctx")
    ingest.ingest_text(store, nb.id, "Big", "Mitochondria make energy. " * 500)

    def _boom(*args, **kwargs):
        raise AssertionError("full source hydration must not happen")

    monkeypatch.setattr(Store, "get_source", _boom)
    excerpts, citations = build_context(store, nb.id)
    assert excerpts
    assert citations
    assert excerpts[0].startswith("[1] Big, pages ")
    assert sum(len(e) for e in excerpts) <= MAX_CONTEXT + len(excerpts[0])


def test_build_context_matches_sequential_content(tmp_path):
    store = _store(tmp_path)
    nb = store.create_notebook(store._test_uid, "Ctx")
    ingest.ingest_text(store, nb.id, "Small", "Mitochondria make energy for cells.")
    excerpts, citations = build_context(store, nb.id)
    assert len(excerpts) == 1
    assert "Mitochondria make energy for cells." in excerpts[0]
    assert citations[0].source_title == "Small"
