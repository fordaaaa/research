from __future__ import annotations


def _nb(client):
    return client.post("/api/notebooks", json={"name": "Study"}).json()


def test_cards_crud_round_trip(client):
    nb = _nb(client)
    created = client.post(
        f"/api/notebooks/{nb['id']}/cards",
        json={"front": "What splits in anaphase?", "back": "Sister chromatids.", "tags": ["Mitosis "]},
    )
    assert created.status_code == 201, created.text
    body = created.json()
    assert body["tags"] == ["mitosis"]

    assert [c["id"] for c in client.get(f"/api/notebooks/{nb['id']}/cards").json()] == [body["id"]]

    updated = client.patch(
        f"/api/notebooks/{nb['id']}/cards/{body['id']}", json={"back": "Sister chromatids move apart."}
    ).json()
    assert updated["back"] == "Sister chromatids move apart."

    assert client.delete(f"/api/notebooks/{nb['id']}/cards/{body['id']}").status_code == 204
    assert client.get(f"/api/notebooks/{nb['id']}/cards").json() == []


def test_cards_validate_input(client):
    nb = _nb(client)
    assert client.post(f"/api/notebooks/{nb['id']}/cards", json={"front": "", "back": "x"}).status_code == 422
    assert client.post(f"/api/notebooks/{nb['id']}/cards", json={"front": "x", "back": ""}).status_code == 422
    assert client.get(f"/api/notebooks/{nb['id']}/cards/not-an-id").status_code in (404, 405)


def test_cards_404s(client):
    assert client.get("/api/notebooks/aaaaaaaaaaaa/cards").status_code == 404
    nb = _nb(client)
    assert client.delete(f"/api/notebooks/{nb['id']}/cards/aaaaaaaaaaaa").status_code == 404


def test_cards_export_tsv(client):
    nb = _nb(client)
    client.post(
        f"/api/notebooks/{nb['id']}/cards",
        json={"front": "Q1", "back": "A1", "tags": ["bio"]},
    )
    client.post(f"/api/notebooks/{nb['id']}/cards", json={"front": "Q2", "back": "A2"})
    response = client.get(f"/api/notebooks/{nb['id']}/cards/export")
    assert response.status_code == 200
    assert "attachment" in response.headers["content-disposition"]
    assert response.text.splitlines()[0] == "Front\tBack\tTags"
    assert "Q1\tA1\tbio" in response.text
