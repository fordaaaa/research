"""Cited excerpt context builder shared by chat and research synthesis."""
from __future__ import annotations

from core.models import Citation

MAX_CONTEXT = 14_000


def build_context(store, notebook_id: str, source_ids: set[str] | None = None) -> tuple[list[str], list[Citation]]:
    excerpts, citations, size = [], [], 0
    for summary in store.list_sources(notebook_id):
        if source_ids is not None and summary.id not in source_ids:
            continue
        source = store.get_source(notebook_id, summary.id)
        if not source:
            continue
        for chunk in source.chunks:
            addition = len(chunk.text)
            if excerpts and size + addition > MAX_CONTEXT:
                return excerpts, citations
            number = len(citations) + 1
            excerpts.append(f"[{number}] {source.title}, pages {', '.join(map(str, chunk.pages))}:\n{chunk.text}")
            citations.append(Citation(source_id=source.id, source_title=source.title, pages=chunk.pages))
            size += addition
    return excerpts, citations
