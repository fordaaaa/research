import io
import zipfile


def test_export_notebook_zip(client):
    nb = client.post("/api/notebooks", json={"name": "My Biology"}).json()
    src = client.post(
        f"/api/notebooks/{nb['id']}/sources/text",
        json={"title": "Cell Notes", "text": "Mitochondria are the powerhouse."},
    ).json()
    client.patch(
        f"/api/sources/{src['id']}", json={"tags": ["biology"]}
    )

    r = client.get(f"/api/notebooks/{nb['id']}/export")
    assert r.status_code == 200
    assert r.headers["content-type"].startswith("application/zip")

    zf = zipfile.ZipFile(io.BytesIO(r.content))
    names = zf.namelist()
    assert "index.md" in names
    source_file = next(n for n in names if n.endswith(".md") and n != "index.md")

    index = zf.read("index.md").decode()
    assert "My Biology" in index
    assert source_file.removesuffix(".md") in index  # Obsidian-style [[link]]

    body = zf.read(source_file).decode()
    assert "Cell Notes" in body
    assert "powerhouse" in body
    assert "tags: biology" in body


def test_export_notebook_unknown_404(client):
    assert client.get("/api/notebooks/000000000000/export").status_code == 404


def test_export_includes_ordered_note_files_and_resolvable_citations(client):
    nb = client.post("/api/notebooks", json={"name": "Research Vault"}).json()
    src = client.post(
        f"/api/notebooks/{nb['id']}/sources/text",
        json={"title": "Primary Source", "text": "A source passage."},
    ).json()
    first = client.post(
        f"/api/notebooks/{nb['id']}/notes",
        json={
            "title": "Zeta note",
            "body": "Later note.",
            "tags": ["Study"],
            "citations": [{"source_id": src["id"], "chunk_seq": 0}],
        },
    ).json()
    second = client.post(
        f"/api/notebooks/{nb['id']}/notes",
        json={"title": "Alpha / note", "body": "Earlier note."},
    ).json()

    response = client.get(f"/api/notebooks/{nb['id']}/export")
    assert response.status_code == 200
    with zipfile.ZipFile(io.BytesIO(response.content)) as zf:
        names = zf.namelist()
        index = zf.read("index.md").decode()
        note_names = [name for name in names if name.startswith("notes/")]
        assert note_names == [
            f"notes/{second['id']}-alpha-note.md",
            f"notes/{first['id']}-zeta-note.md",
        ]
        assert "## Notes" in index
        assert f"[[notes/{second['id']}-alpha-note]]" in index
        assert f"[[notes/{first['id']}-zeta-note]]" in index
        note = zf.read(note_names[1]).decode()
        assert "kind: note" in note
        assert "rev: 1" in note
        assert "tags: study" in note
        assert "## Citations" in note
        assert f"{src['id']}-primary-source.md" in note
        assert "A source passage." not in note


def test_export_note_deleted_source_is_explicit_tombstone(client):
    nb = client.post("/api/notebooks", json={"name": "Tombstones"}).json()
    src = client.post(
        f"/api/notebooks/{nb['id']}/sources/text",
        json={"title": "Gone Source", "text": "Temporary source."},
    ).json()
    note = client.post(
        f"/api/notebooks/{nb['id']}/notes",
        json={
            "title": "A note",
            "body": "Keep the citation.",
            "citations": [{"source_id": src["id"], "chunk_seq": 0}],
        },
    ).json()
    assert client.delete(f"/api/sources/{src['id']}").status_code == 204

    response = client.get(f"/api/notebooks/{nb['id']}/export")
    with zipfile.ZipFile(io.BytesIO(response.content)) as zf:
        body = zf.read(f"notes/{note['id']}-a-note.md").decode()
    assert "[deleted source]" in body
    assert src["id"] in body


def test_export_keeps_notebook_ownership_boundary(client):
    nb = client.post("/api/notebooks", json={"name": "Private"}).json()
    from fastapi.testclient import TestClient
    from api.main import app

    with TestClient(app) as other:
        registered = other.post(
            "/api/auth/register", json={"email": "export-other@example.com", "password": "password123"}
        )
        other.headers.update({"Authorization": f"Bearer {registered.json()['token']}"})
        assert other.get(f"/api/notebooks/{nb['id']}/export").status_code == 404


def test_export_note_citations_do_not_refetch_sources(client, monkeypatch):
    from core import store as store_module

    nb = client.post("/api/notebooks", json={"name": "Cites"}).json()
    src = client.post(
        f"/api/notebooks/{nb['id']}/sources/text",
        json={"title": "Cited Source", "text": "A cited passage."},
    ).json()
    client.post(
        f"/api/notebooks/{nb['id']}/notes",
        json={
            "title": "A note",
            "body": "Three citations.",
            "citations": [{"source_id": src["id"], "chunk_seq": 0}] * 3,
        },
    )

    calls: list[str] = []
    orig = store_module.Store.get_source

    def counting(self, notebook_id, source_id):
        calls.append(source_id)
        return orig(self, notebook_id, source_id)

    monkeypatch.setattr(store_module.Store, "get_source", counting)
    assert client.get(f"/api/notebooks/{nb['id']}/export").status_code == 200
    assert calls == [src["id"]]
