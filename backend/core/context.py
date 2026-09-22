"""Cited excerpt context builder shared by chat and research synthesis."""
from __future__ import annotations

from core.models import Citation

MAX_CONTEXT = 14_000


def build_context(store, notebook_id: str, source_ids: set[str] | None = None) -> tuple[list[str], list[Citation]]:
    excerpts, citations, size = [], [], 0
    for summary in store.list_sources(notebook_id):
        if source_ids is not None and summary.id not in source_ids:
            continue
        offset = 0
        while True:
            page = store.get_source_chunks_page(
                notebook_id, summary.id, offset=offset, limit=64
            )
            if not page:
                break
            _, chunks = page
            if not chunks:
                break
            for chunk in chunks:
                addition = len(chunk.text)
                if excerpts and size + addition > MAX_CONTEXT:
                    return excerpts, citations
                number = len(citations) + 1
                excerpts.append(f"[{number}] {summary.title}, pages {', '.join(map(str, chunk.pages))}:\n{chunk.text}")
                citations.append(Citation(source_id=summary.id, source_title=summary.title, pages=chunk.pages))
                size += addition
            offset += len(chunks)
    return excerpts, citations


def build_note_excerpts(store, notebook_id: str, max_chars: int = 3_000) -> list[str]:
    """Return a bounded set of persisted Markdown note excerpts for prompting."""
    excerpts: list[str] = []
    size = 0
    for summary in store.list_notes(notebook_id):
        note = store.get_note(notebook_id, summary.id)
        if not note:
            continue
        text = f"# {note.title}\n{note.body}".strip()
        if not text:
            continue
        remaining = max_chars - size
        if remaining <= 0:
            break
        excerpts.append(text[:remaining])
        size += min(len(text), remaining)
    return excerpts
