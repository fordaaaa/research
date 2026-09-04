"""Fetch a URL and extract its main article text (readability-style).

Kept separate from parsing binaries so network concerns never leak into the
rest of ingest. `fetch_article` returns (text, title) or raises FetchError.
"""
from __future__ import annotations

from urllib.parse import urlparse

import httpx
import trafilatura

from core import parsers

USER_AGENT = "research/0.1 (local research app)"
TIMEOUT = 20.0


class FetchError(Exception):
    def __init__(self, message: str, status: int = 400) -> None:
        super().__init__(message)
        self.status = status


def fetch_article(url: str) -> tuple[str, str]:
    """Download `url` and extract (clean article text, page title)."""
    scheme = urlparse(url).scheme
    if scheme not in ("http", "https"):
        raise FetchError("url must be http(s)")
    try:
        resp = httpx.get(
            url,
            follow_redirects=True,
            timeout=TIMEOUT,
            headers={"User-Agent": USER_AGENT},
        )
        resp.raise_for_status()
    except httpx.HTTPError as exc:
        raise FetchError(f"failed to fetch url: {exc}", status=502) from exc
    if len(resp.content) > parsers.MAX_BYTES:
        raise FetchError("url content exceeds 50 MB limit", status=413)
    html = resp.text
    text = trafilatura.extract(html, include_links=False)
    if not text or not text.strip():
        raise FetchError("no readable article text found")
    title = _extract_title(html, url)
    return text.strip(), title


def _extract_title(html: str, url: str) -> str:
    try:
        metadata = trafilatura.extract_metadata(html)
        if metadata and metadata.title:
            return metadata.title.strip()
    except Exception:
        pass
    host = urlparse(url).netloc
    return host or "Untitled"