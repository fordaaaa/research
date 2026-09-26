from __future__ import annotations

from core import websearch


def test_web_search_normalizes_public_results(monkeypatch):
    class FakeDDGS:
        def __init__(self, timeout):
            assert timeout == 8

        def text(self, query, max_results, safesearch):
            assert (query, max_results, safesearch) == ("cell biology", 8, "moderate")
            return [
                {"title": "  Cell biology  ", "href": "https://example.com/cells", "body": "  A result.  "},
                {"title": "missing url"},
            ]

    monkeypatch.setattr(websearch, "DDGS", FakeDDGS)

    assert [result.model_dump() for result in websearch.search_web("cell biology")] == [
        {"title": "Cell biology", "url": "https://example.com/cells", "snippet": "A result."}
    ]


def test_web_relevance_floor_drops_gibberish(monkeypatch):
    """Gibberish queries must return [] so the frontend empty state can fire."""
    from core.models import WebSearchResult

    class FakeDDGS:
        def __init__(self, timeout):
            pass

        def text(self, query, max_results, safesearch):
            return [
                {"title": "Cell biology basics", "href": "https://example.com/a", "body": "Mitochondria produce energy."},
                {"title": "Photosynthesis guide", "href": "https://example.com/b", "body": "Plants convert sunlight."},
            ]

    monkeypatch.setattr(websearch, "DDGS", FakeDDGS)
    assert websearch.search_web("xqzjbn kqwop zzz") == []


def test_web_relevance_floor_keeps_sane_query(monkeypatch):
    class FakeDDGS:
        def __init__(self, timeout):
            pass

        def text(self, query, max_results, safesearch):
            return [
                {"title": "Cell biology basics", "href": "https://example.com/a", "body": "Mitochondria produce energy."},
                {"title": "Unrelated cooking blog", "href": "https://example.com/b", "body": "Pasta recipes for dinner."},
            ]

    monkeypatch.setattr(websearch, "DDGS", FakeDDGS)
    results = websearch.search_web("cell biology")
    assert [r.url for r in results] == ["https://example.com/a"]


def test_filter_web_results_unit_deterministic():
    """Direct unit test of the scoring/filter — no network, deterministic."""
    from core.models import WebSearchResult

    rows = [
        WebSearchResult(title="Cell biology basics", url="https://example.com/a", snippet="Mitochondria produce energy."),
        WebSearchResult(title="Pasta recipes", url="https://example.com/b", snippet="Dinner ideas."),
    ]
    assert websearch.filter_web_results("xqzjbn kqwop zzz", rows) == []
    kept = websearch.filter_web_results("cell biology", rows)
    assert [r.url for r in kept] == ["https://example.com/a"]
    assert websearch.score_web_result("cell biology", "Cell biology basics", "Mitochondria produce energy.") >= 1.0
    assert websearch.score_web_result("xqzjbn kqwop zzz", "Cell biology basics", "Mitochondria produce energy.") == 0.0


def test_web_search_returns_a_safe_error(monkeypatch):
    class BrokenDDGS:
        def __init__(self, timeout):
            pass

        def text(self, *args, **kwargs):
            raise RuntimeError("provider details must not leak")

    monkeypatch.setattr(websearch, "DDGS", BrokenDDGS)

    try:
        websearch.search_web("cells")
    except websearch.WebSearchError as exc:
        assert str(exc) == "web search is temporarily unavailable"
    else:
        raise AssertionError("expected WebSearchError")
