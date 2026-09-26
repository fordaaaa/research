from __future__ import annotations


def test_search_returns_timing_header(client) -> None:
    nb = client.post("/api/notebooks", json={"name": "Timing"}).json()
    client.post(
        f"/api/notebooks/{nb['id']}/sources/text",
        json={"title": "Cells", "text": "Mitochondria produce energy for the cell. " * 10},
    )
    r = client.get(f"/api/notebooks/{nb['id']}/search", params={"q": "mitochondria"})
    assert r.status_code == 200
    body = r.json()
    assert isinstance(body, list)
    assert len(body) >= 1
    assert "x-search-took-ms" in {k.lower() for k in r.headers}
    ms = int(r.headers["X-Search-Took-Ms"])
    assert ms >= 0
