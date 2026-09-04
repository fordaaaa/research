from core.fetcher import FetchError, fetch_article


def test_rejects_non_http_scheme():
    try:
        fetch_article("file:///etc/passwd")
        assert False, "expected FetchError"
    except FetchError:
        pass