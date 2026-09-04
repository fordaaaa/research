"""Render a notebook as an Obsidian-style markdown bundle (a .zip).

Everything is plain markdown with YAML frontmatter, laid out so it drops into
an Obsidian vault: an `index.md` links to each source note. Export is a pure
function over the store — no notebook, repository, or framework dependencies.
"""
from __future__ import annotations

import io
import re
import zipfile

from core.models import Source
from core.store import Store


def slugify(name: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")
    return slug or "untitled"


def export_notebook(store: Store, notebook_id: str) -> tuple[bytes, str]:
    """Return (zip file bytes, suggested download filename)."""
    notebook = store.get_notebook(notebook_id)
    if not notebook:
        raise KeyError(notebook_id)
    summaries = store.list_sources(notebook_id)

    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        index = ["---", f"title: {notebook.name}", "kind: notebook", "---", ""]
        if summaries:
            index.append("## Sources")
            for s in summaries:
                stem = f"{s.id}-{slugify(s.title)}"
                index.append(f"- [[{stem}]] — {s.kind} · {s.chunk_count} chunks")
        else:
            index.append("_No sources yet._")
        index.append("")
        zf.writestr("index.md", "\n".join(index))

        for summary in summaries:
            source = store.get_source(notebook_id, summary.id)
            if not source:
                continue
            zf.writestr(
                f"{summary.id}-{slugify(summary.title)}.md", _render_source(source)
            )

    filename = f"{slugify(notebook.name)}-export.zip"
    return buf.getvalue(), filename


def _render_source(source: Source) -> str:
    parts = [
        "---",
        f"title: {source.title}",
        f"kind: {source.kind}",
        f"tags: {', '.join(source.tags)}",
    ]
    if "url" in source.meta:
        parts.append(f"url: {source.meta['url']}")
    parts += ["---", ""]
    for page in source.pages:
        if len(source.pages) > 1:
            parts.append(f"## Page {page.number}")
            parts.append("")
        parts.append(page.text)
        parts.append("")
    return "\n".join(parts)