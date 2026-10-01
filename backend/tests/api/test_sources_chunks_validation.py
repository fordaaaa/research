"""Source chunks paging: negative offsets are rejected with 422."""


def test_chunks_negative_offset_rejected(client):
    nb = client.post("/api/notebooks", json={"name": "nb"}).json()
    src = client.post(
        f"/api/notebooks/{nb['id']}/sources/text",
        json={"title": "T", "text": "Some words here for chunks."},
    ).json()
    resp = client.get(f"/api/sources/{src['id']}/chunks?offset=-1")
    assert resp.status_code == 422
