from __future__ import annotations

from fastapi.testclient import TestClient

from api.main import create_app
from desktop import web_root


def test_desktop_app_serves_web_and_persists_to_configured_data_dir(
    tmp_path, monkeypatch
):
    web = tmp_path / "web"
    web.mkdir()
    (web / "index.html").write_text('<main id="research">Research</main>')
    (web / "app.js").write_text("console.log('research')")
    data = tmp_path / "Library" / "Application Support" / "research" / "data"
    monkeypatch.setenv("RESEARCH_DATA_DIR", str(data))

    with TestClient(create_app(web)) as client:
        assert client.get("/").text == '<main id="research">Research</main>'
        assert client.get("/app.js").text == "console.log('research')"
        notebook = client.post("/api/notebooks", json={"name": "Desktop"}).json()
        assert client.get("/api/health").json() == {"ok": True}

    assert (data / "notebooks.json").is_file()
    assert notebook["name"] == "Desktop"


def test_web_root_uses_the_explicit_desktop_resource_dir(tmp_path, monkeypatch):
    web = tmp_path / "Resources" / "web"
    web.mkdir(parents=True)
    (web / "index.html").write_text("desktop")
    monkeypatch.setenv("RESEARCH_WEB_DIR", str(web))

    assert web_root() == web


def test_desktop_session_protects_notebook_data(tmp_path, monkeypatch):
    web = tmp_path / "web"
    web.mkdir()
    (web / "index.html").write_text("desktop")
    monkeypatch.setenv("RESEARCH_DATA_DIR", str(tmp_path / "data"))
    monkeypatch.setenv("RESEARCH_DESKTOP_TOKEN", "only-this-launch")

    with TestClient(create_app(web)) as client:
        assert client.get("/api/health").status_code == 200
        assert client.get("/api/notebooks").status_code == 403
        response = client.get("/?desktop_token=only-this-launch")
        assert response.status_code == 200
        assert response.text == "desktop"
        assert client.get("/api/notebooks").status_code == 200
        assert response.headers["x-frame-options"] == "DENY"
