"""Store search: identical chunk rows are deduped."""
from __future__ import annotations

from core.models import Chunk, Page, Source, utcnow
from core.store import Store, new_id


def _store(tmp_path) -> Store:
    store = Store(root=tmp_path / "data")
    store._test_uid = store.create_user(f"u{new_id()}@example.com", "password123").id
    return store


def test_search_dedupes_identical_rows(tmp_path):
    store = _store(tmp_path)
    nb = store.create_notebook(store._test_uid, "Dedupe")
    text = "mitochondria produce energy in the cell powerhouse"
    store.create_source(
        Source(
            id=new_id(),
            notebook_id=nb.id,
            kind="paste",
            title="Dup",
            tags=[],
            created_at=utcnow(),
            pages=[Page(number=1, text=text)],
            chunks=[
                Chunk(seq=0, pages=[1], text=text),
                Chunk(seq=1, pages=[1], text=text),
            ],
        )
    )
    hits = store.search(nb.id, "mitochondria energy")
    assert len(hits) >= 1
    keys = [(h.source_id, tuple(h.pages), h.snippet, h.score) for h in hits]
    assert len(keys) == len(set(keys)), f"duplicate rows: {keys}"
