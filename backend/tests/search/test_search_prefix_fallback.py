"""Search prefix fallback: single-token query hits inflected text."""


def test_prefix_fallback_photo_hits_photosynthesis(client):
    nb = client.post("/api/notebooks", json={"name": "Bio"}).json()
    client.post(
        f"/api/notebooks/{nb['id']}/sources/text",
        json={"title": "Plant Bio", "text": "Photosynthesis drives plant growth."},
    )
    r = client.get(f"/api/notebooks/{nb['id']}/search", params={"q": "photo"})
    assert r.status_code == 200
    assert len(r.json()) >= 1
