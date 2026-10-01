"""Pre-check duplicate contract (Round-11): duplicates warn BEFORE saving."""

from fastapi.testclient import TestClient


def _make_notebook(client: TestClient, name: str = "Dup"):
    return client.post("/api/notebooks", json={"name": name}).json()


def test_duplicate_without_force_returns_200_saved_false_and_ingests_nothing(client: TestClient):
    nb = _make_notebook(client)
    first = client.post(
        f"/api/notebooks/{nb['id']}/sources/text",
        json={"title": "First", "text": "Mitochondria make energy for cells."},
    )
    assert first.status_code == 201
    assert first.json()["saved"] is True

    second = client.post(
        f"/api/notebooks/{nb['id']}/sources/text",
        json={"title": "Second", "text": "Mitochondria make energy for cells."},
    )
    assert second.status_code == 200
    body = second.json()
    assert body["saved"] is False
    assert body["duplicate_of"] == {"id": first.json()["id"], "title": "First"}
    sources = client.get(f"/api/notebooks/{nb['id']}/sources").json()
    assert len(sources) == 1


def test_duplicate_with_force_returns_201_and_saves(client: TestClient):
    nb = _make_notebook(client, name="Force2")
    client.post(
        f"/api/notebooks/{nb['id']}/sources/text",
        json={"title": "Orig", "text": "Force saves skip the dupe warn loop."},
    )
    forced = client.post(
        f"/api/notebooks/{nb['id']}/sources/text",
        json={"title": "Copy", "text": "Force saves skip the dupe warn loop.", "force": True},
    )
    assert forced.status_code == 201
    assert forced.json()["saved"] is True
    assert forced.json().get("duplicate_of") is None
    sources = client.get(f"/api/notebooks/{nb['id']}/sources").json()
    assert len(sources) == 2


def test_duplicate_url_without_force_returns_200_saved_false(client: TestClient, monkeypatch):
    from core import fetcher
    from core.article import Article, ArticleParagraph

    def fake_details(url):
        return fetcher.FetchDetails(
            text="photosynthesis powers plants fully",
            title="WP Title",
            article=Article(
                title="WP Title",
                paragraphs=(ArticleParagraph("photosynthesis powers plants fully.", None, 0),),
            ),
        )

    monkeypatch.setattr(fetcher, "fetch_article_details", fake_details)
    nb = _make_notebook(client, name="UrlDupe")
    first = client.post(
        f"/api/notebooks/{nb['id']}/sources/url",
        json={"url": "https://example.com/article"},
    )
    assert first.status_code == 201
    assert first.json()["saved"] is True

    second = client.post(
        f"/api/notebooks/{nb['id']}/sources/url",
        json={"url": "https://example.com/article"},
    )
    assert second.status_code == 200
    body = second.json()
    assert body["saved"] is False
    assert body["duplicate_of"]["id"] == first.json()["id"]
    sources = client.get(f"/api/notebooks/{nb['id']}/sources").json()
    assert len(sources) == 1

    forced = client.post(
        f"/api/notebooks/{nb['id']}/sources/url",
        json={"url": "https://example.com/article", "force": True},
    )
    assert forced.status_code == 201
    assert forced.json()["saved"] is True
    sources = client.get(f"/api/notebooks/{nb['id']}/sources").json()
    assert len(sources) == 2
