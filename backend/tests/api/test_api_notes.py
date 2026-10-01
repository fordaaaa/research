from __future__ import annotations

from fastapi.testclient import TestClient


def _notebook(client):
    response = client.post("/api/notebooks", json={"name": "Biology"})
    assert response.status_code == 201
    return response.json()


def _source(client, notebook_id: str):
    response = client.post(
        f"/api/notebooks/{notebook_id}/sources/text",
        json={"title": "Lecture", "text": "Mitochondria make ATP. " * 20},
    )
    assert response.status_code == 201, response.text
    return response.json()


def test_notes_crud_and_revision_conflict(client):
    notebook = _notebook(client)
    source = _source(client, notebook["id"])
    created = client.post(
        f"/api/notebooks/{notebook['id']}/notes",
        json={
            "title": "Revision plan",
            "body": "Review the mitochondria section.",
            "tags": [" exam ", "biology"],
            "citations": [{"source_id": source["id"], "chunk_seq": 0}],
        },
    )
    assert created.status_code == 201, created.text
    note = created.json()
    assert note["body"] == "Review the mitochondria section."
    assert note["tags"] == ["exam", "biology"]
    assert note["rev"] == 1
    assert client.get(f"/api/notebooks/{notebook['id']}/notes").json()[0]["id"] == note["id"]

    updated = client.patch(
        f"/api/notebooks/{notebook['id']}/notes/{note['id']}",
        json={"base_rev": 1, "body": "Review ATP production."},
    )
    assert updated.status_code == 200
    assert updated.json()["body"] == "Review ATP production."
    assert updated.json()["rev"] == 2

    stale = client.patch(
        f"/api/notebooks/{notebook['id']}/notes/{note['id']}",
        json={"base_rev": 1, "title": "Stale edit"},
    )
    assert stale.status_code == 409
    assert stale.json()["detail"]["current"]["rev"] == 2
    assert client.delete(f"/api/notebooks/{notebook['id']}/notes/{note['id']}").status_code == 204
    assert client.get(f"/api/notebooks/{notebook['id']}/notes/{note['id']}").status_code == 404


def test_notes_validate_citations_and_leave_tombstones(client):
    notebook = _notebook(client)
    source = _source(client, notebook["id"])
    bad_source = "b" * 12
    assert client.post(
        f"/api/notebooks/{notebook['id']}/notes",
        json={"title": "Bad", "body": "x", "citations": [{"source_id": bad_source, "chunk_seq": 0}]},
    ).status_code == 400
    assert client.post(
        f"/api/notebooks/{notebook['id']}/notes",
        json={"title": "Bad", "body": "x", "citations": [{"source_id": source["id"], "chunk_seq": 999}]},
    ).status_code == 400
    created = client.post(
        f"/api/notebooks/{notebook['id']}/notes",
        json={"title": "Good", "body": "x", "citations": [{"source_id": source["id"], "chunk_seq": 0}]},
    )
    assert created.status_code == 201
    note_id = created.json()["id"]
    assert client.delete(f"/api/sources/{source['id']}").status_code == 204
    assert client.get(f"/api/notebooks/{notebook['id']}/notes/{note_id}").json()["citations"] == [
        {"source_id": source["id"], "chunk_seq": 0}
    ]
    preserved = client.patch(
        f"/api/notebooks/{notebook['id']}/notes/{note_id}",
        json={"base_rev": 1, "body": "Keep the source tombstone."},
    )
    assert preserved.status_code == 200, preserved.text
    assert preserved.json()["citations"][0]["source_id"] == source["id"]


def test_notes_are_owned_and_cascade_with_notebook(client, data_dir, monkeypatch):
    notebook = _notebook(client)
    created = client.post(
        f"/api/notebooks/{notebook['id']}/notes", json={"title": "Private", "body": "x"}
    )
    assert created.status_code == 201
    note_id = created.json()["id"]

    from fastapi.testclient import TestClient
    from api.main import app

    with TestClient(app) as other:
        registered = other.post(
            "/api/auth/register", json={"email": "other@example.com", "password": "password123"}
        )
        other.headers.update({"Authorization": f"Bearer {registered.json()['token']}"})
        assert other.get(f"/api/notebooks/{notebook['id']}/notes").status_code == 404
        assert other.get(f"/api/notebooks/{notebook['id']}/notes/{note_id}").status_code == 404

    assert client.delete(f"/api/notebooks/{notebook['id']}").status_code == 204
    assert client.get(f"/api/notebooks/{notebook['id']}/notes").status_code == 404


def test_notes_enforce_payload_bounds_and_revision_requirement(client):
    notebook = _notebook(client)
    path = f"/api/notebooks/{notebook['id']}/notes"
    assert client.post(path, json={"title": "", "body": "x"}).status_code == 422
    assert client.post(path, json={"title": "x" * 201, "body": "x"}).status_code == 422
    assert client.post(path, json={"title": "x", "body": "x", "tags": ["x"] * 21}).status_code == 422
    created = client.post(path, json={"title": "x", "body": "x"}).json()
    assert client.patch(f"{path}/{created['id']}", json={"body": "y"}).status_code == 422
