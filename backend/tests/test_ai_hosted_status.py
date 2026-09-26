"""Hosted-AI status route: disabled by default in the local-first backend."""


def test_r2_hosted_status_route(client):
    resp = client.get("/api/ai/hosted/status")
    assert resp.status_code == 200, resp.text
    assert resp.json() == {"enabled": False}
    from api.main import app

    paths = [r.path for r in app.routes if hasattr(r, "path")]
    assert "/api/ai/hosted/status" in paths
