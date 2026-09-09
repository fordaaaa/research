from __future__ import annotations

from api import outlines as outlines_api
from core.models import WebSearchResult
from core.websearch import WebSearchError


def _nb(client):
    return client.post("/api/notebooks", json={"name": "Deep"}).json()


def _outline(client, nb_id, topic="crabs", items=None, fields=None):
    body = {"topic": topic}
    if items is not None:
        body["items"] = [{"label": label} for label in items]
    if fields is not None:
        body["fields"] = [{"label": label} for label in fields]
    response = client.post(f"/api/notebooks/{nb_id}/outlines", json=body)
    assert response.status_code == 201, response.text
    return response.json()


def test_outline_crud_round_trip(client):
    nb = _nb(client)
    created = _outline(client, nb["id"], items=["Blue crab", "King crab"], fields=["Habitat"])
    assert created["topic"] == "crabs"
    assert [i["label"] for i in created["items"]] == ["Blue crab", "King crab"]
    assert all(i["id"] for i in created["items"])

    listed = client.get(f"/api/notebooks/{nb['id']}/outlines").json()
    assert [o["id"] for o in listed] == [created["id"]]

    fetched = client.get(f"/api/notebooks/{nb['id']}/outlines/{created['id']}").json()
    assert fetched["topic"] == "crabs"

    updated = client.patch(
        f"/api/notebooks/{nb['id']}/outlines/{created['id']}",
        json={"topic": "crab biology", "items": [{"label": "Snow crab"}]},
    ).json()
    assert updated["topic"] == "crab biology"
    assert [i["label"] for i in updated["items"]] == ["Snow crab"]

    assert client.delete(f"/api/notebooks/{nb['id']}/outlines/{created['id']}").status_code == 204
    assert client.get(f"/api/notebooks/{nb['id']}/outlines/{created['id']}").status_code == 404


def test_outline_validates_topic_and_labels(client):
    nb = _nb(client)
    assert client.post(f"/api/notebooks/{nb['id']}/outlines", json={"topic": "ab"}).status_code == 422
    assert client.post(
        f"/api/notebooks/{nb['id']}/outlines",
        json={"topic": "crabs", "items": [{"label": ""}]},
    ).status_code == 422


def test_outline_404s(client):
    nb = _nb(client)
    assert client.get(f"/api/notebooks/{nb['id']}/outlines/aaaaaaaaaaaa").status_code == 404
    assert client.get("/api/notebooks/aaaaaaaaaaaa/outlines").status_code == 404
    assert client.post("/api/notebooks/not-an-id/outlines", json={"topic": "crabs"}).status_code == 400


def test_draft_keyless_returns_heuristic(client):
    nb = _nb(client)
    body = client.post(f"/api/notebooks/{nb['id']}/outlines/draft", json={"topic": "crab biology"}).json()
    assert body["origin"] == "heuristic"
    assert body["items"][0] == "crab biology"
    assert "Overview" in body["fields"]


def test_draft_uses_ai_when_configured(client, monkeypatch):
    nb = _nb(client)
    client.put(
        "/api/settings/ai",
        json={"provider": "gemini", "api_key": "a-key-that-is-long-enough", "model": "gemini-test"},
    )
    monkeypatch.setattr(
        outlines_api.providers,
        "generate",
        lambda provider, key, model, prompt: (
            "ITEMS:\nBlue crab\nKing crab\nFIELDS:\nHabitat\nDiet", "gemini-test",
        ),
    )
    body = client.post(f"/api/notebooks/{nb['id']}/outlines/draft", json={"topic": "crabs"}).json()
    assert body["origin"] == "ai"
    assert body["items"] == ["Blue crab", "King crab"]
    assert body["fields"] == ["Habitat", "Diet"]


def test_deep_searches_per_item(client, monkeypatch):
    nb = _nb(client)
    outline = _outline(client, nb["id"], items=["Blue crab", "King crab"])

    def fake_search(query, limit):
        return [WebSearchResult(title=f"Hit for {query}", url=f"https://ex.example/{query[:4]}", snippet="x")]

    monkeypatch.setattr(outlines_api, "search_web", fake_search)
    monkeypatch.setattr(outlines_api, "sleep", lambda seconds: None)
    body = client.post(
        f"/api/notebooks/{nb['id']}/outlines/{outline['id']}/deep", json={"per_item": 2}
    ).json()
    assert body["failed_items"] == []
    assert len(body["results"]) == 2
    assert body["results"][0]["label"] == "Blue crab"
    assert len(body["results"][0]["queries"]) == 2
    assert body["results"][0]["candidates"]


def test_deep_reports_partial_failure_and_503(client, monkeypatch):
    nb = _nb(client)
    outline = _outline(client, nb["id"], items=["Blue crab"])

    def flaky(query, limit):
        raise WebSearchError("down")

    monkeypatch.setattr(outlines_api, "search_web", flaky)
    response = client.post(f"/api/notebooks/{nb['id']}/outlines/{outline['id']}/deep", json={})
    assert response.status_code == 503


def test_deep_requires_items(client):
    nb = _nb(client)
    outline = _outline(client, nb["id"])
    response = client.post(f"/api/notebooks/{nb['id']}/outlines/{outline['id']}/deep", json={})
    assert response.status_code == 400


def test_report_keyless_writes_structured_note(client):
    nb = _nb(client)
    outline = _outline(client, nb["id"], items=["Blue crab"], fields=["Habitat"])
    client.post(f"/api/notebooks/{nb['id']}/sources/text", json={"title": "Crab notes", "text": "Blue crabs live in estuaries."})
    response = client.post(f"/api/notebooks/{nb['id']}/outlines/{outline['id']}/report", json={})
    assert response.status_code == 201
    body = response.json()
    assert body["origin"] == "digest"
    assert body["source"]["title"] == "Research report: crabs"
    assert body["source"]["meta"]["outline_id"] == outline["id"]
    full = client.get(f"/api/sources/{body['source']['id']}").json()
    joined = "\n".join(chunk["text"] for chunk in full["chunks"])
    assert "## Outline" in joined
    assert "Blue crab" in joined
    assert "Crab notes" in joined


def test_report_requires_sources(client):
    nb = _nb(client)
    outline = _outline(client, nb["id"], items=["Blue crab"])
    response = client.post(f"/api/notebooks/{nb['id']}/outlines/{outline['id']}/report", json={})
    assert response.status_code == 400
