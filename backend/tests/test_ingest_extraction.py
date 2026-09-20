from __future__ import annotations

from core import fetcher, ingest
from core.article import Article, ArticleParagraph


def test_ingest_url_persists_structured_metadata_and_passages(monkeypatch):
    details = fetcher.FetchDetails(
        text="A useful paragraph about rivers and farms.",
        title="River report",
        article=Article(
            title="River report",
            canonical="https://example.com/report",
            site="Example",
            byline="Ada",
            published="2026-09-19",
            paragraphs=(ArticleParagraph("A useful paragraph about rivers and farms.", "Results", 0),),
        ),
    )
    monkeypatch.setattr(fetcher, "fetch_article_details", lambda url: details)
    captured = {}
    monkeypatch.setattr(ingest, "_persist", lambda *args, **kwargs: captured.update(kwargs) or kwargs)

    result = ingest.ingest_url(object(), "notebook", "https://example.com/report")

    assert result["canonical_url"] == details.article.canonical
    assert result["site_name"] == "Example"
    assert result["important_passages"][0].chunk_seq == 0
    assert result["important_passages"][0].pages == [1]
