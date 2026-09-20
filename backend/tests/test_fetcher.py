from core.fetcher import FetchError, fetch_article


def test_rejects_non_http_scheme():
    try:
        fetch_article("file:///etc/passwd")
        assert False, "expected FetchError"
    except FetchError:
        pass


def test_rejects_userinfo_and_private_hosts():
    for url in ("http://user:pass@example.com/a", "http://127.0.0.1/a"):
        try:
            fetch_article(url)
            assert False, "expected FetchError"
        except FetchError:
            pass
