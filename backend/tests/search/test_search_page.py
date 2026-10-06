"""Native-search pagination contract: GET /notebooks/{id}/search/page.

Envelope is SearchPage: query echo, hits, total, limit, offset, has_more,
took_ms, related. Bare /search list/body/headers stay unchanged.
"""
from __future__ import annotations

from typing import Any

from fastapi.testclient import TestClient


def _seed_mito(client: TestClient, name: str = "Paging", n: int = 3) -> dict[str, Any]:
    nb = client.post("/api/notebooks", json={"name": name}).json()
    for i in range(n):
        r = client.post(
            f"/api/notebooks/{nb['id']}/sources/text",
            json={
                "title": f"Source {i}",
                "text": f"mitochondria unique-marker-{i} produce energy for the cell. " * 10,
            },
        )
        assert r.status_code == 201
    return nb


def test_page_envelope_matches_bare_list(client: TestClient) -> None:
    nb = _seed_mito(client, n=3)
    bare = client.get(
        f"/api/notebooks/{nb['id']}/search",
        params={"q": "mitochondria", "limit": 100},
    )
    assert bare.status_code == 200
    assert isinstance(bare.json(), list)
    assert len(bare.json()) >= 3

    page = client.get(
        f"/api/notebooks/{nb['id']}/search/page",
        params={"q": "mitochondria", "limit": 100},
    )
    assert page.status_code == 200
    body = page.json()
    assert body["query"] == "mitochondria"
    assert body["hits"] == bare.json()
    assert body["total"] == len(bare.json())
    assert body["limit"] == 100
    assert body["offset"] == 0
    assert body["related"] is False
    assert body["has_more"] is False
    assert isinstance(body["took_ms"], int) and body["took_ms"] >= 0


def test_page_total_has_more_and_headers(client: TestClient) -> None:
    nb = _seed_mito(client, n=3)
    full = client.get(
        f"/api/notebooks/{nb['id']}/search",
        params={"q": "mitochondria", "limit": 100},
    )
    total = len(full.json())
    assert total >= 3

    first = client.get(
        f"/api/notebooks/{nb['id']}/search/page",
        params={"q": "mitochondria", "limit": 1, "offset": 0},
    )
    assert first.status_code == 200
    b0 = first.json()
    assert b0["total"] == total
    assert len(b0["hits"]) == 1
    assert b0["hits"] == full.json()[0:1]
    assert b0["has_more"] is True
    assert b0["limit"] == 1 and b0["offset"] == 0
    assert int(first.headers["X-Search-Total"]) == total == b0["total"]
    assert int(first.headers["X-Search-Took-Ms"]) >= 0
    assert b0["took_ms"] >= 0

    second = client.get(
        f"/api/notebooks/{nb['id']}/search/page",
        params={"q": "mitochondria", "limit": 1, "offset": 1},
    )
    assert second.status_code == 200
    b1 = second.json()
    assert b1["hits"] == full.json()[1:2]
    assert b1["total"] == total
    assert int(second.headers["X-Search-Total"]) == total
    # 3 total, offset 1 + 1 hit = 2 < 3 so more remains.
    assert b1["has_more"] is True

    last = client.get(
        f"/api/notebooks/{nb['id']}/search/page",
        params={"q": "mitochondria", "limit": 10, "offset": 0},
    )
    assert last.json()["has_more"] is False


def test_page_empty_and_out_of_range(client: TestClient) -> None:
    nb = _seed_mito(client, n=2)
    empty = client.get(
        f"/api/notebooks/{nb['id']}/search/page",
        params={"q": "shakespeare sonnets summer day"},
    )
    assert empty.status_code == 200
    body = empty.json()
    assert body["hits"] == [] and body["total"] == 0
    assert body["has_more"] is False
    assert body["query"] == "shakespeare sonnets summer day"
    assert body["limit"] == 10 and body["offset"] == 0
    assert int(empty.headers["X-Search-Total"]) == 0

    full = client.get(
        f"/api/notebooks/{nb['id']}/search",
        params={"q": "mitochondria", "limit": 100},
    )
    total = len(full.json())
    assert total >= 2
    beyond = client.get(
        f"/api/notebooks/{nb['id']}/search/page",
        params={"q": "mitochondria", "limit": 10, "offset": total + 5},
    )
    assert beyond.status_code == 200
    bb = beyond.json()
    assert bb["hits"] == []
    assert bb["total"] == total
    assert bb["has_more"] is False
    assert bb["offset"] == total + 5
    assert int(beyond.headers["X-Search-Total"]) == total


def test_page_related_alias_and_quotes_literal(client: TestClient) -> None:
    nb = client.post("/api/notebooks", json={"name": "Related page"}).json()
    client.post(
        f"/api/notebooks/{nb['id']}/sources/text",
        json={"title": "Lecture", "text": "Mitochondria produce energy for cells."},
    )
    client.post(
        f"/api/notebooks/{nb['id']}/sources/text",
        json={
            "title": "Phrase",
            "text": "The powerhouse of the cell produces energy.",
        },
    )
    strict = client.get(
        f"/api/notebooks/{nb['id']}/search/page",
        params={"q": "powerhouse"},
    )
    assert strict.status_code == 200
    # Strict is literal: Phrase contains the word, Lecture (mitochondria) does not.
    assert {h["source_title"] for h in strict.json()["hits"]} == {"Phrase"}
    assert strict.json()["related"] is False

    rel = client.get(
        f"/api/notebooks/{nb['id']}/search/page",
        params={"q": "powerhouse", "related": "true"},
    )
    assert rel.status_code == 200
    rbody = rel.json()
    assert rbody["related"] is True
    assert rbody["total"] == 2
    assert {h["source_title"] for h in rbody["hits"]} == {"Lecture", "Phrase"}
    assert any(
        h["source_title"] == "Lecture" and "mitochondria" in h["matched_terms"]
        for h in rbody["hits"]
    )
    # Never invents the query word as a matched term.
    assert all("powerhouse" not in h["matched_terms"] or h["source_title"] == "Phrase" for h in rbody["hits"])

    literal = client.get(
        f"/api/notebooks/{nb['id']}/search/page",
        params={"q": '"powerhouse of the cell"', "related": "true"},
    )
    assert literal.status_code == 200
    lbody = literal.json()
    assert lbody["total"] == 1
    assert lbody["hits"][0]["source_title"] == "Phrase"


def test_page_filters_kind_source_tag(client: TestClient) -> None:
    nb = _seed_mito(client, name="Filters", n=3)
    sources = client.get(f"/api/notebooks/{nb['id']}/sources").json()
    assert len(sources) >= 3
    first_id = sources[0]["id"]
    first_kind = sources[0]["kind"]
    assert first_kind == "paste"

    kind_ok = client.get(
        f"/api/notebooks/{nb['id']}/search/page",
        params={"q": "mitochondria", "kind": "paste", "limit": 100},
    )
    assert kind_ok.status_code == 200
    assert kind_ok.json()["total"] >= 3

    kind_empty = client.get(
        f"/api/notebooks/{nb['id']}/search/page",
        params={"q": "mitochondria", "kind": "pdf", "limit": 100},
    )
    assert kind_empty.status_code == 200
    assert kind_empty.json()["hits"] == []
    assert kind_empty.json()["total"] == 0
    assert kind_empty.json()["has_more"] is False

    by_source = client.get(
        f"/api/notebooks/{nb['id']}/search/page",
        params={"q": "mitochondria", "source": first_id, "limit": 100},
    )
    assert by_source.status_code == 200
    sbody = by_source.json()
    assert sbody["total"] >= 1
    assert all(h["source_id"] == first_id for h in sbody["hits"])

    tag_patch = client.patch(f"/api/sources/{first_id}", json={"tags": ["bio-tag"]})
    assert tag_patch.status_code == 200
    by_tag = client.get(
        f"/api/notebooks/{nb['id']}/search/page",
        params={"q": "mitochondria", "tag": "bio-tag", "limit": 100},
    )
    assert by_tag.status_code == 200
    tbody = by_tag.json()
    assert tbody["total"] >= 1
    assert all(h["source_id"] == first_id for h in tbody["hits"])

    tag_miss = client.get(
        f"/api/notebooks/{nb['id']}/search/page",
        params={"q": "mitochondria", "tag": "no-such-tag", "limit": 100},
    )
    assert tag_miss.json()["hits"] == []
    assert tag_miss.json()["total"] == 0


def test_page_anonymous_401(client: TestClient) -> None:
    nb = _seed_mito(client, n=1)
    from api.main import app as _app

    with TestClient(_app) as anon:
        r = anon.get(
            f"/api/notebooks/{nb['id']}/search/page",
            params={"q": "mitochondria"},
        )
        assert r.status_code == 401


def test_page_cross_user_404_and_malformed_404(client: TestClient) -> None:
    nb = _seed_mito(client, n=1)
    from api.main import app as _app

    with TestClient(_app) as anon:
        rr = anon.post(
            "/api/auth/register",
            json={"email": "stranger-page@example.com", "password": "password123"},
        )
        assert rr.status_code == 201
        token2 = rr.json()["token"]
    with TestClient(_app, headers={"Authorization": f"Bearer {token2}"}) as other:
        r = other.get(
            f"/api/notebooks/{nb['id']}/search/page",
            params={"q": "mitochondria"},
        )
        assert r.status_code == 404
        assert r.json()["detail"] == "notebook not found"

    bad = client.get("/api/notebooks/not-an-id!/search/page", params={"q": "mitochondria"})
    assert bad.status_code == 404
    assert bad.json()["detail"] == "notebook not found"


def test_page_validation(client: TestClient) -> None:
    nb = _seed_mito(client, n=1)
    base = f"/api/notebooks/{nb['id']}/search/page"
    assert client.get(base).status_code == 422
    assert client.get(base, params={"q": ""}).status_code == 422
    assert client.get(base, params={"q": "x" * 501}).status_code == 422
    assert client.get(base, params={"q": "mitochondria", "limit": 0}).status_code == 422
    assert client.get(base, params={"q": "mitochondria", "limit": 101}).status_code == 422
    assert client.get(base, params={"q": "mitochondria", "offset": -1}).status_code == 422


def test_bare_search_unchanged(client: TestClient) -> None:
    nb = _seed_mito(client, name="BareKept", n=2)
    r = client.get(
        f"/api/notebooks/{nb['id']}/search",
        params={"q": "mitochondria", "limit": 1, "offset": 1},
    )
    assert r.status_code == 200
    assert isinstance(r.json(), list)
    assert len(r.json()) == 1
    assert "X-Search-Total" in r.headers
    assert "X-Search-Took-Ms" in r.headers
