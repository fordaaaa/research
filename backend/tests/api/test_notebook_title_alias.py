"""NotebookCreate accepts `title` as an alias of `name` (Round-14 DX fix)."""


def test_title_only_creates_notebook(client):
    r = client.post("/api/notebooks", json={"title": "Biology 101"})
    assert r.status_code == 201
    assert r.json()["name"] == "Biology 101"
    assert "title" not in r.json()


def test_name_wins_when_both_given(client):
    r = client.post("/api/notebooks", json={"name": "Kept", "title": "Dropped"})
    assert r.status_code == 201
    assert r.json()["name"] == "Kept"


def test_neither_or_blank_still_422(client):
    assert client.post("/api/notebooks", json={}).status_code == 422
    assert client.post("/api/notebooks", json={"name": "   "}).status_code == 422
