"""Duplicate precheck: ?force=true query param suppresses the dupe hint on paste/url."""


def test_force_query_param_paste_suppresses_hint(client):
    nb = client.post("/api/notebooks", json={"name": "QForce"}).json()
    text = "Query force saves skip the dupe warn loop."
    first = client.post(
        f"/api/notebooks/{nb['id']}/sources/text",
        json={"title": "Orig", "text": text},
    )
    assert first.status_code == 201

    hint = client.post(
        f"/api/notebooks/{nb['id']}/sources/text",
        json={"title": "Copy", "text": text},
    )
    assert hint.status_code == 200
    assert hint.json()["saved"] is False

    forced = client.post(
        f"/api/notebooks/{nb['id']}/sources/text?force=true",
        json={"title": "Copy", "text": text},
    )
    assert forced.status_code == 201, forced.text
    assert forced.json()["saved"] is True


def test_force_query_param_url_suppresses_hint(client, monkeypatch):
    from core import fetcher
    from core.article import Article, ArticleParagraph

    def fake_details(url):
        return fetcher.FetchDetails(
            text="query force url content here",
            title="Q Title",
            article=Article(
                title="Q Title",
                paragraphs=(ArticleParagraph("query force url content here.", None, 0),),
            ),
        )

    monkeypatch.setattr(fetcher, "fetch_article_details", fake_details)
    nb = client.post("/api/notebooks", json={"name": "QForceUrl"}).json()
    first = client.post(
        f"/api/notebooks/{nb['id']}/sources/url",
        json={"url": "https://example.com/qforce"},
    )
    assert first.status_code == 201

    hint = client.post(
        f"/api/notebooks/{nb['id']}/sources/url",
        json={"url": "https://example.com/qforce"},
    )
    assert hint.status_code == 200
    assert hint.json()["saved"] is False

    forced = client.post(
        f"/api/notebooks/{nb['id']}/sources/url?force=true",
        json={"url": "https://example.com/qforce"},
    )
    assert forced.status_code == 201, forced.text
    assert forced.json()["saved"] is True
