"""Notebook ownership: get/export shape, unknown id 404, stranger 404."""


def test_get_single_notebook_owner_stranger_unknown_export(client):
    # owner creates notebook
    r = client.post("/api/notebooks", json={"name": "Solo"})
    assert r.status_code == 201
    nb_id = r.json()["id"]

    # owner 200 with correct shape
    g = client.get(f"/api/notebooks/{nb_id}")
    assert g.status_code == 200, g.text
    body = g.json()
    assert body["id"] == nb_id
    assert body["name"] == "Solo"
    assert "created_at" in body

    # export still routes correctly
    e = client.get(f"/api/notebooks/{nb_id}/export")
    assert e.status_code == 200, e.text

    # unknown id 404 (valid hex shape, not present)
    assert client.get("/api/notebooks/deadbeefcafe").status_code == 404

    # stranger 404: second user must not see it
    from fastapi.testclient import TestClient

    from api.main import app

    with TestClient(app) as anon:
        rr = anon.post(
            "/api/auth/register",
            json={"email": "stranger@example.com", "password": "password123"},
        )
        assert rr.status_code == 201
        token2 = rr.json()["token"]
    with TestClient(app, headers={"Authorization": f"Bearer {token2}"}) as other:
        assert other.get(f"/api/notebooks/{nb_id}").status_code == 404
