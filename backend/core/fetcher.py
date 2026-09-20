"""Safe, bounded fetching and deterministic article extraction."""
from __future__ import annotations

from dataclasses import dataclass
import ipaddress
import socket
from urllib.parse import urljoin, urlparse

import httpx
import trafilatura

from core import article

USER_AGENT = "research/0.1 (local research app)"
TIMEOUT = 20.0
MAX_HTML_BYTES = 2 * 1024 * 1024
MAX_REDIRECTS = 3


class FetchError(Exception):
    def __init__(self, message: str, status: int = 400) -> None:
        super().__init__(message)
        self.status = status


@dataclass(frozen=True)
class FetchDetails:
    text: str
    title: str
    article: article.Article


def _validate_url(url: str) -> None:
    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https"):
        raise FetchError("url must be http(s)")
    if not parsed.hostname or parsed.username is not None or parsed.password is not None:
        raise FetchError("url must contain a public hostname without userinfo")
    try:
        port = parsed.port
    except ValueError as exc:
        raise FetchError("url has an invalid port") from exc
    if port is not None and port not in (80, 443):
        raise FetchError("url port is not allowed")
    try:
        addresses = {info[4][0] for info in socket.getaddrinfo(parsed.hostname, port, type=socket.SOCK_STREAM)}
    except OSError as exc:
        raise FetchError("url hostname could not be resolved") from exc
    for address in addresses:
        try:
            ip = ipaddress.ip_address(address)
        except ValueError as exc:
            raise FetchError("url resolved to an invalid address") from exc
        if ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_multicast or ip.is_reserved or ip.is_unspecified:
            raise FetchError("url resolves to a disallowed address")


def _read_html(response: httpx.Response) -> str:
    content_type = response.headers.get("content-type", "").split(";", 1)[0].strip().lower()
    if content_type != "text/html":
        raise FetchError("url did not return HTML", status=415)
    length = response.headers.get("content-length")
    if length and length.isdigit() and int(length) > MAX_HTML_BYTES:
        raise FetchError("url content exceeds HTML limit", status=413)
    chunks: list[bytes] = []
    size = 0
    for chunk in response.iter_bytes():
        size += len(chunk)
        if size > MAX_HTML_BYTES:
            raise FetchError("url content exceeds HTML limit", status=413)
        chunks.append(chunk)
    return b"".join(chunks).decode(response.encoding or "utf-8", errors="replace")


def fetch_article_details(url: str) -> FetchDetails:
    """Fetch bounded HTML, validating every redirect, and extract article details."""
    current = url
    try:
        with httpx.Client(follow_redirects=False, timeout=TIMEOUT, headers={"User-Agent": USER_AGENT}) as client:
            for _ in range(MAX_REDIRECTS + 1):
                _validate_url(current)
                with client.stream("GET", current) as response:
                    if response.is_redirect:
                        location = response.headers.get("location")
                        if not location:
                            raise FetchError("redirect missing location", status=502)
                        current = urljoin(current, location)
                        continue
                    response.raise_for_status()
                    html = _read_html(response)
                parsed = article.extract_article(html, current)
                text = trafilatura.extract(html, include_links=False)
                if not text or not text.strip():
                    text = "\n\n".join(item.text for item in parsed.paragraphs)
                if not text.strip():
                    raise FetchError("no readable article text found")
                title = parsed.title or _extract_title(html, current)
                return FetchDetails(text.strip(), title, parsed)
    except FetchError:
        raise
    except httpx.HTTPError as exc:
        raise FetchError("failed to fetch url", status=502) from exc
    raise FetchError("too many redirects", status=502)


def fetch_article(url: str) -> tuple[str, str]:
    """Backward-compatible `(clean article text, page title)` wrapper."""
    details = fetch_article_details(url)
    return details.text, details.title


def _extract_title(html: str, url: str) -> str:
    try:
        metadata = trafilatura.extract_metadata(html)
        if metadata and metadata.title:
            return metadata.title.strip()
    except Exception:
        pass
    return urlparse(url).netloc or "Untitled"
