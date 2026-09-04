from core import ingest
from core.models import Chunk, Page, Source, utcnow
from core.store import Store, new_id


def _store(tmp_path) -> Store:
    return Store(root=tmp_path / "data")


def _tagged_source(store: Store, nb_id: str, title: str, text: str, tags: list[str]) -> None:
    store.create_source(
        Source(
            id=new_id(),
            notebook_id=nb_id,
            kind="paste",
            title=title,
            tags=tags,
            created_at=utcnow(),
            pages=[Page(number=1, text=text)],
            chunks=[Chunk(seq=0, pages=[1], text=text)],
        )
    )


def test_search_phrase_wins_over_loose(tmp_path):
    store = _store(tmp_path)
    nb = store.create_notebook("Bio")
    ingest.ingest_text(
        store, nb.id, "Lecture",
        "Mitochondria are the powerhouse of the cell. Mitochondria produce energy.",
    )
    ingest.ingest_text(
        store, nb.id, "Notes",
        "Energy matters for sports and daily life. Cells need glucose.",
    )
    exact = store.search(nb.id, 'cell "powerhouse of the cell"')
    loose = store.search(nb.id, "cell powerhouse energy")
    assert exact and loose
    assert exact[0].score > loose[0].score


def test_search_filter_by_kind(tmp_path):
    store = _store(tmp_path)
    nb = store.create_notebook("Filter")
    ingest.ingest_text(store, nb.id, "Pasted", "photosynthesis happens in leaves")
    assert len(store.search(nb.id, "photosynthesis", kind="paste")) == 1
    assert len(store.search(nb.id, "photosynthesis", kind="pdf")) == 0


def test_search_filter_by_source_ids(tmp_path):
    store = _store(tmp_path)
    nb = store.create_notebook("Sources")
    a = ingest.ingest_text(store, nb.id, "A", "mitochondria produce energy")
    ingest.ingest_text(store, nb.id, "B", "chlorophyll captures light")
    hits = store.search(nb.id, "light", source_ids=[a.id])
    assert hits == []


def test_search_filter_by_tag(tmp_path):
    store = _store(tmp_path)
    nb = store.create_notebook("Tags")
    _tagged_source(store, nb.id, "Cell notes", "mitochondria produce energy", ["biology"])
    _tagged_source(store, nb.id, "Plant notes", "chlorophyll captures light", ["botany"])
    hits = store.search(nb.id, "light", tags=["botany"])
    assert len(hits) == 1
    assert hits[0].source_title == "Plant notes"
    assert store.search(nb.id, "light", tags=["biology"]) == []


def test_search_offset_and_limit(tmp_path):
    store = _store(tmp_path)
    nb = store.create_notebook("Paging")
    for i in range(5):
        ingest.ingest_text(store, nb.id, f"src{i}", f"shared term elephant {i}")
    all_hits = store.search(nb.id, "elephant")
    page = store.search(nb.id, "elephant", limit=2, offset=2)
    assert len(all_hits) == 5
    assert len(page) == 2
    assert page[0].score <= all_hits[2].score


def test_search_uses_source_document_frequency(tmp_path):
    store = _store(tmp_path)
    nb = store.create_notebook("Ranking")
    rare = ingest.ingest_text(store, nb.id, "Rare", "quasar")
    ingest.ingest_text(store, nb.id, "Common A", "biology")
    ingest.ingest_text(store, nb.id, "Common B", "biology")

    rare_hit = store.search(nb.id, "quasar")[0]
    common_hit = store.search(nb.id, "biology")[0]

    assert rare_hit.source_id == rare.id
    assert rare_hit.score > common_hit.score
    assert rare_hit.matched_terms == ["quasar"]
