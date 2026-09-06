def test_health(client):
    assert client.get("/api/health").json() == {"ok": True}


def test_web_search_api(client, monkeypatch):
    from api import web

    monkeypatch.setattr(
        web,
        "search_web",
        lambda query, limit: [{"title": "Cells", "url": "https://example.com", "snippet": "Biology"}],
    )
    response = client.get("/api/web/search", params={"q": "cells"})
    assert response.status_code == 200
    assert response.json()[0]["url"] == "https://example.com"


def test_ai_settings_and_grounded_chat(client, monkeypatch):
    from api import ai

    assert client.get("/api/settings/ai").json()["configured"] is False
    saved = client.put(
        "/api/settings/ai",
        json={"api_key": "a-key-that-is-not-returned-to-the-browser", "model": "gemini-test"},
    ).json()
    assert saved == {"configured": True, "provider": "gemini", "model": "gemini-test"}
    nb = client.post("/api/notebooks", json={"name": "Chat"}).json()
    client.post(
        f"/api/notebooks/{nb['id']}/sources/text",
        json={"title": "Cells", "text": "Mitochondria make energy for cells."},
    )
    monkeypatch.setattr(
        ai.providers,
        "generate",
        lambda provider, key, model, prompt: ("Mitochondria make energy [1].", model),
    )
    response = client.post(f"/api/notebooks/{nb['id']}/chat", json={"message": "What makes energy?"})
    assert response.status_code == 200
    assert response.json()["citations"][0]["source_title"] == "Cells"
    assert response.json()["model"] == "gemini-test"


def test_notebook_crud_upload_and_search(client):
    nb = client.post("/api/notebooks", json={"name": "Biology"}).json()

    pasted = client.post(
        f"/api/notebooks/{nb['id']}/sources/text",
        json={"title": "Cells", "text": "Mitochondria produce energy for the cell. " * 40},
    )
    assert pasted.status_code == 201
    src = pasted.json()
    assert src["chunk_count"] >= 1

    uploaded = client.post(
        f"/api/notebooks/{nb['id']}/sources",
        files={"files": ("notes.txt", b"Chlorophyll absorbs light in plants.", "text/plain")},
    )
    assert uploaded.status_code == 200
    assert uploaded.json()["errors"] == []

    sources = client.get(f"/api/notebooks/{nb['id']}/sources").json()
    assert len(sources) == 2
    assert {s["title"] for s in sources} == {"Cells", "notes"}

    hits = client.get(
        f"/api/notebooks/{nb['id']}/search", params={"q": "mitochondria energy"}
    ).json()
    assert len(hits) >= 1
    assert "Mitochondria" in hits[0]["snippet"]
    assert hits[0]["source_title"] == "Cells"

    chunks = client.get(f"/api/sources/{src['id']}/chunks").json()
    assert chunks["total"] >= 1
    assert len(chunks["chunks"]) == chunks["total"]

    assert client.delete(f"/api/sources/{src['id']}").status_code == 204
    assert len(client.get(f"/api/notebooks/{nb['id']}/sources").json()) == 1

    assert client.delete(f"/api/notebooks/{nb['id']}").status_code == 204
    assert client.get(f"/api/notebooks/{nb['id']}/sources").status_code == 404


def test_multi_file_upload_with_one_bad_file(client):
    nb = client.post("/api/notebooks", json={"name": "Mixed"}).json()
    r = client.post(
        f"/api/notebooks/{nb['id']}/sources",
        files=[
            ("files", ("good.txt", b"plain text content here", "text/plain")),
            ("files", ("bad.exe", b"MZ\x90\x00not supported", "application/octet-stream")),
        ],
    )
    assert r.status_code == 200
    body = r.json()
    assert len(body["sources"]) == 1
    assert len(body["errors"]) == 1
    assert body["errors"][0]["file"] == "bad.exe"


def test_unsupported_single_file_still_errors(client):
    nb = client.post("/api/notebooks", json={"name": "X"}).json()
    r = client.post(
        f"/api/notebooks/{nb['id']}/sources",
        files={"files": ("x.exe", b"MZ\x90\x00", "application/octet-stream")},
    )
    assert r.status_code == 200
    assert r.json()["sources"] == []
    assert r.json()["errors"][0]["detail"] == "unsupported file type"


def test_search_unknown_notebook_404(client):
    # valid id format, but the notebook does not exist
    assert client.get("/api/notebooks/000000000000/search", params={"q": "x"}).status_code == 404


def test_search_filters_phrase_and_paging(client):
    nb = client.post("/api/notebooks", json={"name": "Filtering"}).json()
    a = client.post(
        f"/api/notebooks/{nb['id']}/sources/text",
        json={"title": "Lecture", "text": "The powerhouse of the cell produces energy. " * 30},
    ).json()
    client.post(
        f"/api/notebooks/{nb['id']}/sources/text",
        json={"title": "Notes", "text": "Photosynthesis captures sunlight in leaves."},
    )

    exact = client.get(
        f"/api/notebooks/{nb['id']}/search",
        params={"q": 'energy "powerhouse of the cell"'},
    ).json()
    loose = client.get(
        f"/api/notebooks/{nb['id']}/search", params={"q": "energy powerhouse cell"}
    ).json()
    assert exact and loose and exact[0]["score"] > loose[0]["score"]

    kind = client.get(
        f"/api/notebooks/{nb['id']}/search", params={"q": "energy", "kind": "paste"}
    ).json()
    assert kind and all(h["source_title"] in ("Lecture", "Notes") for h in kind)

    scoped = client.get(
        f"/api/notebooks/{nb['id']}/search",
        params={"q": "sunlight", "source": a["id"]},
    ).json()
    assert scoped == []

    limited = client.get(
        f"/api/notebooks/{nb['id']}/search", params={"q": "the", "limit": 2, "offset": 1}
    ).json()
    assert len(limited) <= 2


def test_update_source_rename_and_tags(client):
    nb = client.post("/api/notebooks", json={"name": "Tagged"}).json()
    src = client.post(
        f"/api/notebooks/{nb['id']}/sources/text",
        json={"title": "Untitled", "text": "Mitochondria are in cells."},
    ).json()

    r = client.patch(
        f"/api/sources/{src['id']}",
        json={"title": "Cell Biology", "tags": ["biology", "Lecture 2"]},
    )
    assert r.status_code == 200
    body = r.json()
    assert body["title"] == "Cell Biology"
    assert "biology" in body["tags"]

    # changes reflect in the source list and tag-filtered search
    listed = client.get(f"/api/notebooks/{nb['id']}/sources").json()
    assert listed[0]["title"] == "Cell Biology"
    assert listed[0]["tags"] == ["biology", "lecture 2"]

    hits = client.get(
        f"/api/notebooks/{nb['id']}/search", params={"q": "cells", "tag": "biology"}
    ).json()
    assert len(hits) == 1

    # PATCH clears tags when given an empty array
    r2 = client.patch(f"/api/sources/{src['id']}", json={"tags": []})
    assert r2.json()["tags"] == []


def test_update_source_404(client):
    assert client.patch("/api/sources/000000000000", json={"title": "x"}).status_code == 404


def test_url_source_ingest(client, monkeypatch):
    from core import fetcher

    monkeypatch.setattr(
        fetcher, "fetch_article", lambda url: ("photosynthesis powers plants fully", "WP Title")
    )
    nb = client.post("/api/notebooks", json={"name": "Web"}).json()
    r = client.post(
        f"/api/notebooks/{nb['id']}/sources/url",
        json={"url": "https://example.com/article"},
    )
    assert r.status_code == 201
    body = r.json()
    assert body["kind"] == "url"
    assert body["title"] == "WP Title"
    assert body["meta"]["url"] == "https://example.com/article"
    assert body["chunk_count"] >= 1

    hits = client.get(
        f"/api/notebooks/{nb['id']}/search", params={"q": "photosynthesis"}
    ).json()
    assert len(hits) == 1


def test_url_source_fetch_error(client, monkeypatch):
    from core import fetcher
    from core.fetcher import FetchError

    def boom(url):
        raise FetchError("no readable article text found", status=400)

    monkeypatch.setattr(fetcher, "fetch_article", boom)
    nb = client.post("/api/notebooks", json={"name": "Web"}).json()
    r = client.post(
        f"/api/notebooks/{nb['id']}/sources/url",
        json={"url": "https://example.com/empty"},
    )
    assert r.status_code == 400
    assert "article" in r.json()["detail"]


def test_invalid_id_returns_400(client):
    # malformed ids (anything that doesn't match core.store.new_id()) must be
    # rejected at the route boundary — otherwise they could escape into the
    # JSON store's path joins and read/write files outside notebooks/.
    # (URLs that try to traverse (e.g. "../etc") get normalized away by the
    # HTTP client and never reach the route at all, so we use a string that
    # passes through as-is but fails the id regex.)
    assert client.get("/api/notebooks/notahexid/search", params={"q": "x"}).status_code == 400
    assert client.get("/api/sources/notahexid").status_code == 400
    assert client.delete("/api/notebooks/notahexid").status_code == 400
