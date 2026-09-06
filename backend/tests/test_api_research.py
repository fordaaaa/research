from __future__ import annotations

from api import research as research_api
from core.websearch import WebSearchError
from core.models import WebSearchResult


def _nb(client):
    return client.post("/api/notebooks", json={"name": "Research"}).json()


def _put_settings(client):
    client.put(
        "/api/settings/ai",
        json={"provider": "gemini", "api_key": "a-key-that-is-long-enough", "model": "gemini-test"},
    )


def test_plan_keyless_returns_heuristic_queries(client):
    nb = _nb(client)
    response = client.post(f"/api/notebooks/{nb['id']}/research/plan", json={"topic": "crab biology"})
    assert response.status_code == 200
    body = response.json()
    assert body["origin"] == "heuristic"
    assert body["queries"][0] == "crab biology"
    assert len(body["queries"]) == 5


def test_plan_validates_topic_length(client):
    nb = _nb(client)
    assert client.post(f"/api/notebooks/{nb['id']}/research/plan", json={"topic": "ab"}).status_code == 422
    assert client.post(f"/api/notebooks/{nb['id']}/research/plan", json={"topic": "x" * 301}).status_code == 422


def test_plan_uses_ai_when_configured(client, monkeypatch):
    nb = _nb(client)
    _put_settings(client)
    monkeypatch.setattr(
        research_api.providers,
        "generate",
        lambda provider, key, model, prompt: ("1. crab overview\n2. crab examples\n3. crab risks", "gemini-test"),
    )
    response = client.post(f"/api/notebooks/{nb['id']}/research/plan", json={"topic": "crabs"})
    assert response.status_code == 200
    body = response.json()
    assert body["origin"] == "ai"
    assert body["queries"] == ["crab overview", "crab examples", "crab risks"]


def test_plan_falls_back_to_heuristic_on_ai_error(client, monkeypatch):
    nb = _nb(client)
    _put_settings(client)

    def boom(provider, key, model, prompt):
        raise research_api.providers.AIError("rate-limited")

    monkeypatch.setattr(research_api.providers, "generate", boom)
    response = client.post(f"/api/notebooks/{nb['id']}/research/plan", json={"topic": "crabs"})
    assert response.status_code == 200
    assert response.json()["origin"] == "heuristic"


def test_plan_falls_back_when_ai_output_unparseable(client, monkeypatch):
    nb = _nb(client)
    _put_settings(client)
    monkeypatch.setattr(
        research_api.providers,
        "generate",
        lambda provider, key, model, prompt: ("Sorry, I cannot help with that.", "gemini-test"),
    )
    response = client.post(f"/api/notebooks/{nb['id']}/research/plan", json={"topic": "crabs"})
    assert response.status_code == 200
    assert response.json()["origin"] == "heuristic"


def test_plan_404_unknown_notebook(client):
    response = client.post("/api/notebooks/aaaaaaaaaaaa/research/plan", json={"topic": "crabs"})
    assert response.status_code == 404


def test_plan_rejects_invalid_id(client):
    response = client.post("/api/notebooks/not-an-id/research/plan", json={"topic": "crabs"})
    assert response.status_code == 400


def test_gather_merges_and_ranks_across_queries(client, monkeypatch):
    nb = _nb(client)
    shared = WebSearchResult(title="Shared", url="https://shared.example/a", snippet="about crabs")
    other = WebSearchResult(title="Other", url="https://other.example/b", snippet="about crabs")

    def fake_search(query, limit):
        if query == "crabs":
            return [shared, other]
        return [shared]

    monkeypatch.setattr(research_api, "search_web", fake_search)
    monkeypatch.setattr(research_api, "sleep", lambda seconds: None)
    response = client.post(
        f"/api/notebooks/{nb['id']}/research/gather", json={"queries": ["crabs", "crab examples"]}
    )
    assert response.status_code == 200
    body = response.json()
    assert body["failed_queries"] == []
    urls = [c["url"] for c in body["candidates"]]
    assert urls.index("https://shared.example/a") < urls.index("https://other.example/b")
    assert body["candidates"][0]["matched_queries"] == ["crabs", "crab examples"]


def test_gather_excludes_urls_already_in_notebook(client, monkeypatch):
    from core import fetcher

    nb = _nb(client)
    monkeypatch.setattr(fetcher, "fetch_article", lambda url: ("existing text", "Existing"))
    client.post(f"/api/notebooks/{nb['id']}/sources/url", json={"url": "https://have.example/one"})

    def fake_search(query, limit):
        return [
            WebSearchResult(title="Have", url="https://have.example/one", snippet=""),
            WebSearchResult(title="New", url="https://new.example/two", snippet=""),
        ]

    monkeypatch.setattr(research_api, "search_web", fake_search)
    response = client.post(f"/api/notebooks/{nb['id']}/research/gather", json={"queries": ["anything"]})
    assert [c["url"] for c in response.json()["candidates"]] == ["https://new.example/two"]


def test_gather_reports_partial_failure(client, monkeypatch):
    nb = _nb(client)

    def fake_search(query, limit):
        if query == "bad query":
            raise WebSearchError("web search is temporarily unavailable")
        return [WebSearchResult(title="Ok", url="https://ok.example/a", snippet="")]

    monkeypatch.setattr(research_api, "search_web", fake_search)
    monkeypatch.setattr(research_api, "sleep", lambda seconds: None)
    response = client.post(
        f"/api/notebooks/{nb['id']}/research/gather", json={"queries": ["good query", "bad query"]}
    )
    assert response.status_code == 200
    body = response.json()
    assert body["failed_queries"] == ["bad query"]
    assert len(body["candidates"]) == 1


def test_gather_503_when_all_queries_fail(client, monkeypatch):
    nb = _nb(client)

    def fake_search(query, limit):
        raise WebSearchError("web search is temporarily unavailable")

    monkeypatch.setattr(research_api, "search_web", fake_search)
    response = client.post(f"/api/notebooks/{nb['id']}/research/gather", json={"queries": ["q"]})
    assert response.status_code == 503


def test_gather_validates_query_bounds(client):
    nb = _nb(client)
    response = client.post(
        f"/api/notebooks/{nb['id']}/research/gather", json={"queries": [f"q{i}" for i in range(7)]}
    )
    assert response.status_code == 422
    response = client.post(
        f"/api/notebooks/{nb['id']}/research/gather", json={"queries": ["q" * 250]}
    )
    assert response.status_code == 422


def test_synthesize_keyless_writes_digest_note(client):
    nb = _nb(client)
    for title, text in [("Crabs One", "Crabs are decapods."), ("Crabs Two", "Crabs live in water.")]:
        client.post(f"/api/notebooks/{nb['id']}/sources/text", json={"title": title, "text": text})
    response = client.post(
        f"/api/notebooks/{nb['id']}/research/synthesize",
        json={"topic": "crabs", "queries": ["what are crabs"]},
    )
    assert response.status_code == 201
    body = response.json()
    assert body["origin"] == "digest"
    assert body["model"] is None
    source = body["source"]
    assert source["kind"] == "paste"
    assert source["title"] == "Research overview: crabs"
    assert source["meta"]["research_topic"] == "crabs"
    full = client.get(f"/api/sources/{source['id']}").json()
    joined = "\n".join(chunk["text"] for chunk in full["chunks"])
    assert "what are crabs" in joined
    assert "Crabs One" in joined


def test_synthesize_uses_ai_when_configured(client, monkeypatch):
    nb = _nb(client)
    _put_settings(client)
    client.post(f"/api/notebooks/{nb['id']}/sources/text", json={"title": "Crabs", "text": "Crabs matter."})
    monkeypatch.setattr(
        research_api.providers,
        "generate",
        lambda provider, key, model, prompt: ("Crabs matter a lot [1].", model),
    )
    response = client.post(
        f"/api/notebooks/{nb['id']}/research/synthesize", json={"topic": "crabs", "queries": []}
    )
    assert response.status_code == 201
    body = response.json()
    assert body["origin"] == "ai"
    assert body["model"] == "gemini-test"
    full = client.get(f"/api/sources/{body['source']['id']}").json()
    joined = "\n".join(chunk["text"] for chunk in full["chunks"])
    assert "Crabs matter a lot [1]." in joined
    assert "Sources:" in joined


def test_synthesize_falls_back_to_digest_on_ai_error(client, monkeypatch):
    nb = _nb(client)
    _put_settings(client)
    client.post(f"/api/notebooks/{nb['id']}/sources/text", json={"title": "Crabs", "text": "Crabs matter."})

    def boom(provider, key, model, prompt):
        raise research_api.providers.AIError("rate-limited")

    monkeypatch.setattr(research_api.providers, "generate", boom)
    response = client.post(
        f"/api/notebooks/{nb['id']}/research/synthesize", json={"topic": "crabs", "queries": []}
    )
    assert response.status_code == 201
    assert response.json()["origin"] == "digest"


def test_synthesize_requires_sources(client):
    nb = _nb(client)
    response = client.post(
        f"/api/notebooks/{nb['id']}/research/synthesize", json={"topic": "crabs", "queries": []}
    )
    assert response.status_code == 400


def test_synthesize_honors_source_ids_subset(client):
    nb = _nb(client)
    one = client.post(f"/api/notebooks/{nb['id']}/sources/text", json={"title": "Crabs One", "text": "decapods"}).json()
    client.post(f"/api/notebooks/{nb['id']}/sources/text", json={"title": "Crabs Two", "text": "water dwellers"})
    response = client.post(
        f"/api/notebooks/{nb['id']}/research/synthesize",
        json={"topic": "crabs", "queries": [], "source_ids": [one["id"]]},
    )
    assert response.status_code == 201
    full = client.get(f"/api/sources/{response.json()['source']['id']}").json()
    joined = "\n".join(chunk["text"] for chunk in full["chunks"])
    assert "Crabs One" in joined
    assert "Crabs Two" not in joined


def test_synthesize_rejects_unknown_source_id(client):
    nb = _nb(client)
    client.post(f"/api/notebooks/{nb['id']}/sources/text", json={"title": "Crabs", "text": "decapods"})
    response = client.post(
        f"/api/notebooks/{nb['id']}/research/synthesize",
        json={"topic": "crabs", "queries": [], "source_ids": ["aaaaaaaaaaaa"]},
    )
    assert response.status_code == 400


def test_synthesize_404_unknown_notebook(client):
    response = client.post(
        "/api/notebooks/aaaaaaaaaaaa/research/synthesize", json={"topic": "crabs", "queries": []}
    )
    assert response.status_code == 404
