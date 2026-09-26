"""Render a notebook as an Obsidian-style markdown bundle (a .zip).

Everything is plain markdown with YAML frontmatter, laid out so it drops into
an Obsidian vault: an `index.md` links to each source note. Export is a pure
function over the store — no notebook, repository, or framework dependencies.
"""
from __future__ import annotations

import io
import json
import re
import zipfile

from core.models import Note, Source
from core.store import Store


def slugify(name: str) -> str:
    """Slug for export filenames: lowercase, [^a-z0-9]+ → -, cap ~40 chars."""
    slug = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")
    slug = slug[:40].strip("-")
    return slug or "source"


def _unique_name(used: set[str], base: str) -> str:
    """Return a collision-free filename; append -2, -3, ... on clashes."""
    if base not in used:
        used.add(base)
        return base
    stem = base.removesuffix(".md")
    i = 2
    while True:
        candidate = f"{stem}-{i}.md"
        if candidate not in used:
            used.add(candidate)
            return candidate
        i += 1


def _yaml(value: str | list[str]) -> str:
    """Render a frontmatter scalar/sequence so titles and tags cannot inject keys."""
    return json.dumps(value)


def export_notebook(store: Store, user_id: str, notebook_id: str) -> tuple[bytes, str]:
    """Return (zip file bytes, suggested download filename)."""
    notebook = store.get_notebook(user_id, notebook_id)
    if not notebook:
        raise KeyError(notebook_id)
    summaries = store.list_sources(notebook_id)

    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        index = ["---", f"title: {_yaml(notebook.name)}", "kind: notebook", "---", ""]
        used: set[str] = {"index.md"}
        source_filenames: dict[str, str] = {}
        for summary in summaries:
            base = f"{slugify(summary.title)}-{summary.id[:8]}.md"
            source_filenames[summary.id] = _unique_name(used, base)
        if summaries:
            index.append("## Sources")
            for s in summaries:
                stem = source_filenames[s.id].removesuffix(".md")
                index.append(f"- [[{stem}]] — {s.kind} · {s.chunk_count} chunks")
        else:
            index.append("_No sources yet._")
        notes = store.list_notes(notebook_id)
        note_filenames: dict[str, str] = {}
        for note in notes:
            base = f"notes/{slugify(note.title)}-{note.id[:8]}.md"
            note_filenames[note.id] = _unique_name(used, base)
        index.append("")
        if notes:
            index.append("## Notes")
            for note in notes:
                stem = note_filenames[note.id].removesuffix(".md")
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
                note_filenames[note.id],
                _render_note(full_note, source_filenames),
            )

    filename = f"{slugify(notebook.name)}-export.zip"
    return buf.getvalue(), filename


def _render_source(source: Source) -> str:
    parts = [
        "---",
        f"title: {_yaml(source.title)}",
        f"kind: {_yaml(source.kind)}",
        f"tags: {_yaml(source.tags)}",
    ]
    if "url" in source.meta:
        parts.append(f"url: {_yaml(str(source.meta['url']))}")
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
        f"title: {_yaml(note.title)}",
        "kind: note",
        f"rev: {note.rev}",
        f"updated_at: {_yaml(note.updated_at.isoformat())}",
        f"tags: {_yaml(note.tags)}",
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
                stem = filename.removesuffix(".md")
                parts.append(f"- [[{stem}]] — chunk {citation.chunk_seq}")
            else:
                parts.append(
                    f"- [deleted source] `{citation.source_id}` — chunk {citation.chunk_seq}"
                )
    return "\n".join(parts) + "\n"
