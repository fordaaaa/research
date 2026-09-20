"""Small, deterministic HTML article extraction primitives.

This module deliberately uses only the standard library.  It is intended for
offline-friendly ingestion and gives callers structured paragraphs without
pretending to understand the page with a model.
"""
from __future__ import annotations

from dataclasses import dataclass
from html.parser import HTMLParser
from urllib.parse import urlparse
import re


@dataclass(frozen=True)
class ArticleParagraph:
    text: str
    heading: str | None = None
    index: int = 0


@dataclass(frozen=True)
class Article:
    title: str
    paragraphs: tuple[ArticleParagraph, ...]
    canonical: str | None = None
    site: str | None = None
    byline: str | None = None
    published: str | None = None

    @property
    def canonical_url(self) -> str | None:
        return self.canonical

    @property
    def site_name(self) -> str | None:
        return self.site


_SPACE = re.compile(r"\s+")
_BOILERPLATE = re.compile(
    r"(?:advert|banner|cookie|footer|header|modal|nav|newsletter|promo|related|share|social|subscribe|toolbar)",
    re.I,
)
# Void elements never emit an end tag; counting them in _skip_depth would leak
# the boilerplate skip over the real article that follows.
_VOID = frozenset(
    {"area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track", "wbr"}
)


def _clean(text: str) -> str:
    return _SPACE.sub(" ", text).strip()


class _ArticleParser(HTMLParser):
    _META_KEYS = {
        "title": ("og:title", "twitter:title"),
        "site": ("og:site_name", "application-name"),
        "published": ("article:published_time", "date", "pubdate"),
        "byline": ("author", "article:author"),
    }

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.meta: dict[str, str] = {}
        self.canonical: str | None = None
        self.title_parts: list[str] = []
        self._title_tag = False
        self._heading: str | None = None
        self._heading_parts: list[str] | None = None
        self._paragraph_parts: list[str] | None = None
        self._paragraph_heading: str | None = None
        self._paragraph_is_byline = False
        self._byline_parts: list[str] = []
        self._paragraphs: list[ArticleParagraph] = []
        self._skip_depth = 0

    def handle_starttag(self, tag: str, attrs_list: list[tuple[str, str | None]]) -> None:
        attrs = {key.lower(): value or "" for key, value in attrs_list}
        tag = tag.lower()
        if self._skip_depth:
            if tag not in _VOID:
                self._skip_depth += 1
            return
        if tag in {"script", "style", "template", "noscript", "nav", "footer", "aside", "form"}:
            self._skip_depth = 1
            return
        marker = f"{attrs.get('id', '')} {attrs.get('class', '')}"
        if tag in {"div", "section"} and _BOILERPLATE.search(marker):
            self._skip_depth = 1
            return
        if tag == "meta":
            key = (attrs.get("property") or attrs.get("name") or "").lower()
            content = _clean(attrs.get("content", ""))
            for field, keys in self._META_KEYS.items():
                if key in keys and content and field not in self.meta:
                    self.meta[field] = content
            return
        if tag == "link" and attrs.get("rel", "").lower() == "canonical":
            self.canonical = attrs.get("href") or None
        elif tag == "title":
            self._title_tag = True
        elif tag in {"h1", "h2", "h3", "h4"}:
            self._heading_parts = []
        elif tag == "p":
            self._paragraph_is_byline = bool(re.search(r"(?:byline|author)", marker, re.I))
            if _BOILERPLATE.search(marker) or self._paragraph_is_byline:
                if self._paragraph_is_byline:
                    self._byline_parts = []
                self._skip_depth = 1
            else:
                self._paragraph_parts = []
                self._paragraph_heading = self._heading

    def handle_endtag(self, tag: str) -> None:
        tag = tag.lower()
        if self._skip_depth:
            if self._paragraph_is_byline and tag == "p":
                text = _clean("".join(self._byline_parts))
                if text.lower().startswith("by "):
                    text = text[3:].strip()
                if text:
                    self.meta.setdefault("byline", text)
                self._paragraph_is_byline = False
            self._skip_depth -= 1
            return
        if tag == "title":
            self._title_tag = False
        elif tag in {"h1", "h2", "h3", "h4"}:
            heading = _clean("".join(self._heading_parts))
            if heading:
                if not self.meta.get("title") and tag == "h1":
                    self.meta["title"] = heading
                self._heading = heading
            self._heading_parts = None
        elif tag == "p" and self._paragraph_parts is not None:
            text = _clean("".join(self._paragraph_parts))
            if text:
                self._paragraphs.append(ArticleParagraph(text, self._paragraph_heading, len(self._paragraphs)))
            self._paragraph_parts = None

    def handle_data(self, data: str) -> None:
        if self._skip_depth:
            if self._paragraph_is_byline:
                self._byline_parts.append(data)
            return
        if self._title_tag:
            self.title_parts.append(data)
        if self._heading_parts is not None:
            self._heading_parts.append(data)
        if self._paragraph_parts is not None:
            self._paragraph_parts.append(data)


def extract_article(html: str, url: str | None = None) -> Article:
    """Extract metadata and clean, heading-associated paragraphs from HTML."""
    parser = _ArticleParser()
    parser.feed(html)
    parser.close()
    title = parser.meta.get("title") or _clean("".join(parser.title_parts))
    site = parser.meta.get("site")
    if not site and url:
        site = urlparse(url).netloc or None
    return Article(
        title=title,
        paragraphs=tuple(parser._paragraphs),
        canonical=parser.canonical or url,
        site=site,
        byline=parser.meta.get("byline"),
        published=parser.meta.get("published"),
    )
