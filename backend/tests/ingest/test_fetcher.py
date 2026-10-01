import httpx

from core.fetcher import FetchError, _read_html, fetch_article


def test_rejects_non_http_scheme():
    try:
        fetch_article("file:///etc/passwd")
        assert False, "expected FetchError"
    except FetchError:
        pass


def test_rejects_unencrypted_http():
    try:
        fetch_article("http://example.com/article")
        assert False, "expected FetchError"
    except FetchError as exc:
        assert "https" in str(exc).lower()


def test_rejects_userinfo_and_private_hosts():
    for url in ("https://user:pass@example.com/a", "https://127.0.0.1/a"):
        try:
            fetch_article(url)
            assert False, "expected FetchError"
        except FetchError:
            pass


def test_reads_xhtml_articles():
    response = httpx.Response(
        200,
        headers={"content-type": "application/xhtml+xml; charset=utf-8"},
        text="<html><body><article><p>Research text.</p></article></body></html>",
    )
    assert "Research text." in _read_html(response)
