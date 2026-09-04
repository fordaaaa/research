from __future__ import annotations

from core import chunker, fetcher, parsers
from core.models import Page, Source, utcnow
from core.store import Store, new_id


class IngestError(Exception):
    def __init__(self, message: str, status: int = 400) -> None:
        super().__init__(message)
        self.status = status


def ingest_bytes(
    store: Store, notebook_id: str, filename: str | None, content_type: str | None, data: bytes
) -> Source:
    """Parse + chunk + store an uploaded file. Raises IngestError on bad input."""
    if len(data) > parsers.MAX_BYTES:
        raise IngestError("file exceeds 50 MB limit", status=413)
    if not data:
        raise IngestError("file is empty")
    kind = parsers.detect_kind(filename, content_type, data)
    if kind is None:
        raise IngestError("unsupported file type", status=415)
    try:
        pages = parsers.parse(data, kind)
    except ValueError as exc:
        raise IngestError(str(exc)) from exc
    return _persist(store, notebook_id, _title_from(filename), kind, pages)


def ingest_text(store: Store, notebook_id: str, title: str, text: str) -> Source:
    """Store pasted text as a single-page source."""
    return _persist(store, notebook_id, title.strip() or "Pasted note", "paste",
                    [Page(number=1, text=text.strip())])


def ingest_url(store: Store, notebook_id: str, url: str) -> Source:
    """Fetch a URL, extract its article text, and store it as a source."""
    text, title = fetcher.fetch_article(url)
    return _persist(
        store,
        notebook_id,
        title,
        "url",
        [Page(number=1, text=text)],
        extra_meta={"url": url},
    )


def _persist(
    store: Store,
    notebook_id: str,
    title: str,
    kind: str,
    pages: list[Page],
    extra_meta: dict | None = None,
) -> Source:
    chunks = chunker.chunk_pages(pages)
    words = sum(len(p.text.split()) for p in pages)
    meta = {"page_count": len(pages), "word_count": words}
    if extra_meta:
        meta.update(extra_meta)
    source = Source(
        id=new_id(),
        notebook_id=notebook_id,
        kind=kind,  # type: ignore[arg-type]
        title=title,
        meta=meta,
        created_at=utcnow(),
        pages=pages,
        chunks=chunks,
    )
    store.create_source(source)
    return source


def _title_from(filename: str | None) -> str:
    if not filename:
        return "Untitled"
    stem = filename.rsplit("/", 1)[-1].rsplit(".", 1)[0].strip()
    return stem or "Untitled"
