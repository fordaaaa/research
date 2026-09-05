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
