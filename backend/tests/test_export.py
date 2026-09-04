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