from __future__ import annotations

import json
import os
import shutil
import uuid
from pathlib import Path
from typing import Any

from core.models import Notebook, SearchHit, Source, SourceSummary, utcnow
from core.search import EmptyQuery, parse_query, score_chunk


def new_id() -> str:
    return uuid.uuid4().hex[:12]


def _read_json(path: Path, default: Any) -> Any:
    try:
        return json.loads(path.read_text())
    except (OSError, json.JSONDecodeError):
        return default


class Store:
    """JSON-file-backed storage for notebooks, sources, and search.

    Deliberately not SQLite — see AGENTS.md. Swapping this class's internals
    (e.g. to SQLite FTS5) must not change its interface.
    """

    def __init__(self, root: Path | None = None) -> None:
        env = os.environ.get("RESEARCH_DATA_DIR")
        self.root = Path(env) if env else Path(__file__).resolve().parents[1] / "data"
        self.notebooks_dir = self.root / "notebooks"
        self.notebooks_dir.mkdir(parents=True, exist_ok=True)
        self._index_path = self.root / "notebooks.json"
        self._refresh_indexes()

    def _refresh_indexes(self) -> None:
        """Reload notebooks.json and rebuild the in-memory id indexes."""
        rows = self._load_index()
        self._by_id: dict[str, dict] = {r["id"]: r for r in rows}
        self._source_index: dict[str, str] = {}  # source_id -> notebook_id
        for r in rows:
            meta = _read_json(self._meta_path(r["id"]), {})
            for s in meta.get("sources", []):
                if "id" in s:
                    self._source_index[s["id"]] = r["id"]

    # ---------- low-level helpers ----------

    @staticmethod
    def _write_json(path: Path, data: Any) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        tmp = path.with_suffix(path.suffix + ".tmp")
        tmp.write_text(json.dumps(data, ensure_ascii=False, indent=2))
        os.replace(tmp, path)

    def _nb_dir(self, notebook_id: str) -> Path:
        return self.notebooks_dir / notebook_id

    def _meta_path(self, notebook_id: str) -> Path:
        return self._nb_dir(notebook_id) / "meta.json"

    def _source_path(self, notebook_id: str, source_id: str) -> Path:
        return self._nb_dir(notebook_id) / f"{source_id}.json"

    def _load_index(self) -> list[dict]:
        return _read_json(self._index_path, [])

    def _save_index(self, rows: list[dict]) -> None:
        self._write_json(self._index_path, rows)

    # ---------- notebooks ----------

    def list_notebooks(self) -> list[Notebook]:
        rows = self._load_index()
        return [Notebook.model_validate(r) for r in rows]

    def create_notebook(self, name: str) -> Notebook:
        nb = Notebook(id=new_id(), name=name.strip(), created_at=utcnow())
        rows = self._load_index()
        rows.append(nb.model_dump(mode="json"))
        self._save_index(rows)
        self._write_json(self._meta_path(nb.id), {"sources": []})
        self._by_id[nb.id] = nb.model_dump(mode="json")
        return nb

    def get_notebook(self, notebook_id: str) -> Notebook | None:
        row = self._by_id.get(notebook_id)
        return Notebook.model_validate(row) if row else None

    def delete_notebook(self, notebook_id: str) -> bool:
        rows = self._load_index()
        kept = [r for r in rows if r.get("id") != notebook_id]
        if len(kept) == len(rows):
            return False
        self._save_index(kept)
        shutil.rmtree(self._nb_dir(notebook_id), ignore_errors=True)
        self._by_id.pop(notebook_id, None)
        for sid, nid in list(self._source_index.items()):
            if nid == notebook_id:
                self._source_index.pop(sid, None)
        return True

    # ---------- sources ----------

    def _load_meta(self, notebook_id: str) -> list[dict]:
        return _read_json(self._meta_path(notebook_id), {}).get("sources", [])

    def _save_meta(self, notebook_id: str, sources: list[dict]) -> None:
        self._write_json(self._meta_path(notebook_id), {"sources": sources})

    def list_sources(self, notebook_id: str) -> list[SourceSummary]:
        return [SourceSummary.model_validate(r) for r in self._load_meta(notebook_id)]

    def create_source(self, source: Source) -> SourceSummary:
        self._write_json(
            self._source_path(source.notebook_id, source.id),
            source.model_dump(mode="json"),
        )
        summary = SourceSummary(
            **{k: v for k, v in source.model_dump().items() if k not in ("pages", "chunks")},
            chunk_count=len(source.chunks),
        )
        sources = self._load_meta(source.notebook_id)
        sources.append(summary.model_dump(mode="json"))
        self._save_meta(source.notebook_id, sources)
        self._source_index[source.id] = source.notebook_id
        return summary

    def get_source(self, notebook_id: str, source_id: str) -> Source | None:
        data = _read_json(self._source_path(notebook_id, source_id), None)
        return Source.model_validate(data) if data else None

    def find_source(self, source_id: str) -> Source | None:
        notebook_id = self._source_index.get(source_id)
        if notebook_id is None:
            return None
        return self.get_source(notebook_id, source_id)

    def delete_source(self, notebook_id: str, source_id: str) -> bool:
        sources = self._load_meta(notebook_id)
        kept = [s for s in sources if s.get("id") != source_id]
        if len(kept) == len(sources):
            return False
        self._save_meta(notebook_id, kept)
        path = self._source_path(notebook_id, source_id)
        if path.exists():
            path.unlink()
        self._source_index.pop(source_id, None)
        return True

    # ---------- search ----------

    def search(
        self,
        notebook_id: str,
        query: str,
        *,
        kind: str | None = None,
        source_ids: list[str] | None = None,
        tags: list[str] | None = None,
        limit: int = 10,
        offset: int = 0,
    ) -> list[SearchHit]:
        """Keyword search with AND semantics, phrases, and source-level filters."""
        try:
            parsed = parse_query(query)
        except EmptyQuery:
            return []
        source_filter = set(source_ids) if source_ids else None
        tag_filter = set(tags) if tags else None
        hits: list[SearchHit] = []
        for summary in self.list_sources(notebook_id):
            if kind and summary.kind != kind:
                continue
            if source_filter and summary.id not in source_filter:
                continue
            if tag_filter and not (tag_filter & set(summary.tags)):
                continue
            src = self.get_source(notebook_id, summary.id)
            if not src:
                continue
            for chunk in src.chunks:
                matched, score = score_chunk(chunk.text, parsed)
                if not matched:
                    continue
                hits.append(
                    SearchHit(
                        source_id=src.id,
                        source_title=src.title,
                        pages=chunk.pages,
                        score=score,
                        snippet=_snippet(chunk.text, parsed.terms),
                    )
                )
        hits.sort(key=lambda h: h.score, reverse=True)
        return hits[offset : offset + limit]


def _snippet(original: str, terms: list[str], width: int = 80) -> str:
    lower = original.lower()
    pos = -1
    for t in terms:
        pos = lower.find(t)
        if pos != -1:
            break
    if pos == -1:
        return original[: width * 2] + ("…" if len(original) > width * 2 else "")
    start = max(0, pos - width)
    end = min(len(original), pos + width)
    prefix = "…" if start > 0 else ""
    suffix = "…" if end < len(original) else ""
    return prefix + original[start:end].strip() + suffix

