"""Export filenames: slug-based with unique suffixes, links resolve via index."""
import io
import zipfile


def test_export_slug_filenames_and_links_resolve(client):
    nb = client.post("/api/notebooks", json={"name": "Vault"}).json()
    s1 = client.post(
        f"/api/notebooks/{nb['id']}/sources/text",
        json={"title": "My Great Source!", "text": "Alpha passage here."},
    ).json()
    s2 = client.post(
        f"/api/notebooks/{nb['id']}/sources/text",
        json={"title": "My Great Source!", "text": "Beta passage here, distinct words xyzzy."},
    ).json()
    r = client.get(f"/api/notebooks/{nb['id']}/export")
    assert r.status_code == 200
    zf = zipfile.ZipFile(io.BytesIO(r.content))
    names = zf.namelist()
    src_names = [n for n in names if n != "index.md"]
    assert src_names, names
    # slug-based, not opaque id-only
    assert any(n.startswith("my-great-source-") for n in src_names), names
    # collisions get unique suffixes
    assert len(set(src_names)) == len(src_names)
    index = zf.read("index.md").decode()
    for n in src_names:
        assert n.removesuffix(".md") in index, (n, index)
    _ = (s1, s2)
