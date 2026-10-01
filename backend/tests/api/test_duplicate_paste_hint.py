"""Duplicate pre-check: identical paste warns BEFORE saving (nothing ingested)."""


def _make_notebook(client, name="Dup"):
    return client.post("/api/notebooks", json={"name": name}).json()


def test_identical_paste_twice_second_returns_200_saved_false(client):
    nb = _make_notebook(client)
    first = client.post(
        f"/api/notebooks/{nb['id']}/sources/text",
        json={"title": "First", "text": "Mitochondria make energy for cells."},
    )
    assert first.status_code == 201
    first_body = first.json()
    assert first_body["saved"] is True
    assert first_body.get("duplicate_of") is None

    second = client.post(
        f"/api/notebooks/{nb['id']}/sources/text",
        json={"title": "Second", "text": "Mitochondria make energy for cells."},
    )
    assert second.status_code == 200
    body = second.json()
    assert body["saved"] is False
    assert body["duplicate_of"] is not None
    assert body["duplicate_of"]["id"] == first_body["id"]
    assert body["duplicate_of"]["title"] == first_body["title"]
    # pre-check: nothing was ingested, so only the first source exists
    sources = client.get(f"/api/notebooks/{nb['id']}/sources").json()
    assert len(sources) == 1


def test_different_text_returns_null(client):
    nb = _make_notebook(client, name="Dup2")
    client.post(
        f"/api/notebooks/{nb['id']}/sources/text",
        json={"title": "A", "text": "Mitochondria make energy."},
    )
    second = client.post(
        f"/api/notebooks/{nb['id']}/sources/text",
        json={"title": "B", "text": "Chlorophyll captures sunlight."},
    )
    assert second.status_code == 201
    assert second.json()["saved"] is True
    assert second.json().get("duplicate_of") is None


def test_same_text_other_notebook_returns_null(client):
    nb1 = _make_notebook(client, name="NB1")
    nb2 = _make_notebook(client, name="NB2")
    client.post(
        f"/api/notebooks/{nb1['id']}/sources/text",
        json={"title": "Orig", "text": "Shared identical text here."},
    )
    r = client.post(
        f"/api/notebooks/{nb2['id']}/sources/text",
        json={"title": "Copy", "text": "Shared identical text here."},
    )
    assert r.status_code == 201
    assert r.json()["saved"] is True
    assert r.json().get("duplicate_of") is None


def test_existing_response_shape_still_passes(client):
    nb = _make_notebook(client, name="Shape")
    r = client.post(
        f"/api/notebooks/{nb['id']}/sources/text",
        json={"title": "Cells", "text": "Mitochondria produce energy. " * 5},
    )
    assert r.status_code == 201
    body = r.json()
    assert body["chunk_count"] >= 1
    assert body["title"] == "Cells"
    assert body["saved"] is True


def test_force_true_saves_despite_duplicate(client):
    nb = _make_notebook(client, name="Force")
    client.post(
        f"/api/notebooks/{nb['id']}/sources/text",
        json={"title": "Orig", "text": "Force saves skip the dupe warn loop."},
    )
    forced = client.post(
        f"/api/notebooks/{nb['id']}/sources/text",
        json={"title": "Copy", "text": "Force saves skip the dupe warn loop.", "force": True},
    )
    assert forced.status_code == 201
    assert forced.json()["saved"] is True
    assert forced.json().get("duplicate_of") is None
    sources = client.get(f"/api/notebooks/{nb['id']}/sources").json()
    assert len(sources) == 2
