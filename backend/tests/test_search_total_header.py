"""Search total header: X-Search-Total mirrors the unpaginated hit count; body stays a bare list."""
from __future__ import annotations


def _make_notebook_with_sources(client, n: int = 3) -> str:
    nb = client.post("/api/notebooks", json={"name": "Totals"}).json()
    for i in range(n):
        client.post(
            f"/api/notebooks/{nb['id']}/sources/text",
            json={
                "title": f"Source {i}",
                "text": f"mitochondria unique-marker-{i} produce energy for the cell. " * 10,
            },
        )
    return nb["id"]


def test_search_total_header_present(client) -> None:
    nb_id = _make_notebook_with_sources(client)
    r = client.get(f"/api/notebooks/{nb_id}/search", params={"q": "mitochondria"})
    assert r.status_code == 200
    assert isinstance(r.json(), list)
    assert "x-search-total" in {k.lower() for k in r.headers}


def test_search_total_equals_unpaginated_hits_body_unchanged(client) -> None:
    nb_id = _make_notebook_with_sources(client, n=3)
    full = client.get(f"/api/notebooks/{nb_id}/search", params={"q": "mitochondria", "limit": 100})
    assert full.status_code == 200
    total = len(full.json())
    assert total >= 3

    page = client.get(
        f"/api/notebooks/{nb_id}/search",
        params={"q": "mitochondria", "limit": 1, "offset": 1},
    )
    assert page.status_code == 200
    body = page.json()
    assert isinstance(body, list)
    assert len(body) == 1
    assert int(page.headers["X-Search-Total"]) == total
    assert body == full.json()[1:2]
