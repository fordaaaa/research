"""Render a notebook as an Obsidian-style markdown bundle (a .zip).

Everything is plain markdown with YAML frontmatter, laid out so it drops into
an Obsidian vault: an `index.md` links to each source note. Export is a pure
function over the store — no notebook, repository, or framework dependencies.
"""
from __future__ import annotations

import io
import re
import zipfile

from core.models import Note, Source
from core.store import Store


def slugify(name: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")
    return slug or "untitled"


def export_notebook(store: Store, user_id: str, notebook_id: str) -> tuple[bytes, str]:
    """Return (zip file bytes, suggested download filename)."""
    notebook = store.get_notebook(user_id, notebook_id)
    if not notebook:
        raise KeyError(notebook_id)
    summaries = store.list_sources(notebook_id)

    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        index = ["---", f"title: {notebook.name}", "kind: notebook", "---", ""]
        source_filenames = {
            summary.id: f"{summary.id}-{slugify(summary.title)}.md"
            for summary in summaries
        }
        if summaries:
            index.append("## Sources")
            for s in summaries:
                stem = source_filenames[s.id].removesuffix(".md")
                index.append(f"- [[{stem}]] — {s.kind} · {s.chunk_count} chunks")
        else:
            index.append("_No sources yet._")
        notes = store.list_notes(notebook_id)
        index.append("")
        if notes:
            index.append("## Notes")
            for note in notes:
                stem = f"notes/{note.id}-{slugify(note.title)}"
                index.append(f"- [[{stem}]] — rev {note.rev}")
        else:
            index.append("## Notes")
            index.append("_No notes yet._")
        index.append("")
        zf.writestr("index.md", "\n".join(index))

        for summary in summaries:
            source = store.get_source(notebook_id, summary.id)
            if not source:
                continue
            zf.writestr(
                source_filenames[summary.id], _render_source(source)
            )
        for note in notes:
            full_note = store.get_note(notebook_id, note.id)
            if not full_note:
                continue
            zf.writestr(
                f"notes/{note.id}-{slugify(note.title)}.md",
                _render_note(full_note, source_filenames),
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


def _render_note(note: Note, source_filenames: dict[str, str]) -> str:
    parts = [
        "---",
        f"title: {note.title}",
        "kind: note",
        f"rev: {note.rev}",
        f"updated_at: {note.updated_at.isoformat()}",
        f"tags: {', '.join(note.tags)}",
        "---",
        "",
        note.body,
        "",
        "## Citations",
    ]
    if not note.citations:
        parts.append("_No citations._")
    else:
        for citation in note.citations:
            filename = source_filenames.get(citation.source_id)
            if filename:
                parts.append(f"- [[{filename}]] — chunk {citation.chunk_seq}")
            else:
                parts.append(
                    f"- [deleted source] `{citation.source_id}` — chunk {citation.chunk_seq}"
                )
    return "\n".join(parts) + "\n"
