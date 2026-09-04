def test_health(client):
    assert client.get("/api/health").json() == {"ok": True}


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
    assert client.get("/api/notebooks/nope/search", params={"q": "x"}).status_code == 404
