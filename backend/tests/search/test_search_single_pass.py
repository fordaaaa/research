"""Single-pass paginated search: one computation yields page + total.

RED test for the bounded optimization: the search route must not repeat
loading/deserializing/stemming/ranking merely to compute X-Search-Total.
store.search_with_total() computes once and returns (page, total-after-dedup);
store.search() stays a list-returning wrapper; EmptyQuery -> ([], 0).
"""
from __future__ import annotations

from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient

from core import ingest
from core.models import Source
from core.store import Store, new_id


def _store(tmp_path: Path) -> tuple[Store, str]:
    store = Store(root=tmp_path / "data")
    user = store.create_user(f"u{new_id()}@example.com", "password123")
    return store, user.id


def _seed(store: Store, nb_id: str, n: int = 3) -> None:
    for i in range(n):
        ingest.ingest_text(
            store,
            nb_id,
            f"Source {i}",
            f"mitochondria unique-marker-{i} produce energy for the cell. " * 5,
        )


def test_search_with_total_computes_once_and_paginates_after_dedup(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    store, user_id = _store(tmp_path)
    nb = store.create_notebook(user_id, "SinglePass")
    _seed(store, nb.id, n=3)

    get_calls: list[str] = []
    orig_get = Store.get_source

    def counting(self: Store, notebook_id: str, source_id: str) -> Source | None:
        get_calls.append(source_id)
        return orig_get(self, notebook_id, source_id)

    monkeypatch.setattr(Store, "get_source", counting)

    import core.store as store_module

    rank_calls: list[str] = []
    orig_score = store_module.score_chunk

    def counting_score(*args: Any, **kwargs: Any) -> tuple[bool, float, list[str]]:
        rank_calls.append("score")
        return orig_score(*args, **kwargs)

    monkeypatch.setattr(store_module, "score_chunk", counting_score)

    # Single paginated call computes page + total-after-dedup in one pass.
    get_calls.clear()
    rank_calls.clear()
    page, total = store.search_with_total(nb.id, "mitochondria", limit=1, offset=1)
    assert isinstance(page, list) and isinstance(total, int)
    assert len(get_calls) == 3, f"expected single pass over 3 sources, got {get_calls}"
    first_rank_n = len(rank_calls)
    assert first_rank_n > 0

    # Same corpus, unpaginated: total-after-dedup matches, page is the slice.
    get_calls.clear()
    rank_calls.clear()
    full_page, full_total = store.search_with_total(nb.id, "mitochondria", limit=100, offset=0)
    assert full_total == total
    assert page == full_page[1:2]
    # One pass per call: same per-source loads and ranking cost, not doubled.
    assert len(get_calls) == 3, f"expected single pass over 3 sources, got {get_calls}"
    assert len(rank_calls) == first_rank_n


def test_search_wrapper_preserves_list_signature_and_empty_query(tmp_path: Path) -> None:
    store, user_id = _store(tmp_path)
    nb = store.create_notebook(user_id, "Wrapper")
    _seed(store, nb.id, n=2)
    hits = store.search(nb.id, "mitochondria", limit=10, offset=0)
    assert isinstance(hits, list)
    page, total = store.search_with_total(nb.id, "mitochondria", limit=10, offset=0)
    assert hits == page
    assert total == len(hits)
    assert store.search(nb.id, "   ") == []
    assert store.search_with_total(nb.id, "   ") == ([], 0)


def test_route_single_pass_total_body_timing_filter_prefix(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    from core.store import Store as StoreCls

    nb = client.post("/api/notebooks", json={"name": "Route"}).json()
    for i in range(3):
        client.post(
            f"/api/notebooks/{nb['id']}/sources/text",
            json={
                "title": f"Source {i}",
                "text": f"mitochondria unique-marker-{i} produce energy for the cell. " * 10,
            },
        )
    sources = client.get(f"/api/notebooks/{nb['id']}/sources").json()
    first_kind = sources[0]["kind"]
    first_id = sources[0]["id"]
    client.post(
        f"/api/notebooks/{nb['id']}/sources/text",
        json={"title": "Plant Bio", "text": "Photosynthesis drives plant growth."},
    )

    loads: list[str] = []
    orig_get = StoreCls.get_source

    def counting(self: Store, notebook_id: str, source_id: str) -> Source | None:
        loads.append(source_id)
        return orig_get(self, notebook_id, source_id)

    monkeypatch.setattr(StoreCls, "get_source", counting)

    full = client.get(
        f"/api/notebooks/{nb['id']}/search",
        params={"q": "mitochondria", "limit": 100},
    )
    assert full.status_code == 200
    n_sources = len(
        client.get(f"/api/notebooks/{nb['id']}/sources").json()
    )
    loads.clear()
    page = client.get(
        f"/api/notebooks/{nb['id']}/search",
        params={"q": "mitochondria", "limit": 1, "offset": 1},
    )
    assert page.status_code == 200
    body = page.json()
    assert isinstance(body, list) and len(body) == 1
    assert int(page.headers["X-Search-Total"]) == len(full.json())
    assert body == full.json()[1:2]
    assert "x-search-took-ms" in {k.lower() for k in page.headers}
    # Single pass: per-source loads bounded by source count, not doubled.
    assert 0 < len(loads) <= n_sources, f"double search detected: {len(loads)} loads"

    # Filter + prefix semantics unchanged on the single-pass path.
    f = client.get(
        f"/api/notebooks/{nb['id']}/search",
        params={"q": "mitochondria", "kind": first_kind, "limit": 100},
    )
    assert f.status_code == 200
    assert len(f.json()) >= 1
    assert int(f.headers["X-Search-Total"]) == len(f.json())
    fs = client.get(
        f"/api/notebooks/{nb['id']}/search",
        params={"q": "mitochondria", "source": first_id, "limit": 100},
    )
    assert fs.status_code == 200
    assert int(fs.headers["X-Search-Total"]) == len(fs.json())
    p = client.get(f"/api/notebooks/{nb['id']}/search", params={"q": "photo"})
    assert p.status_code == 200
    assert len(p.json()) >= 1
    assert int(p.headers["X-Search-Total"]) == len(p.json())
