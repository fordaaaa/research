from __future__ import annotations

import json
import os
import shutil
import uuid
from pathlib import Path
from typing import Any

from core.models import (
    Flashcard,
    Notebook,
    ResearchOutline,
    SearchHit,
    Skill,
    Source,
    SourceSummary,
    utcnow,
)
from core.search import EmptyQuery, parse_query, score_chunk, stemmed_words


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

    def update_source(
        self,
        notebook_id: str,
        source_id: str,
        *,
        title: str | None = None,
        tags: list[str] | None = None,
    ) -> Source | None:
        """Rename and/or retag a source, persisting both the file and the index."""
        src = self.get_source(notebook_id, source_id)
        if not src:
            return None
        if title is not None:
            src.title = title.strip()
        if tags is not None:
            src.tags = [t.strip().lower() for t in tags if t.strip()]
        self._write_json(
            self._source_path(notebook_id, source_id), src.model_dump(mode="json")
        )
        sources = self._load_meta(notebook_id)
        changed = False
        for s in sources:
            if s.get("id") == source_id:
                s["title"] = src.title
                s["tags"] = src.tags
                changed = True
        if changed:
            self._save_meta(notebook_id, sources)
        return src

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

    # ---------- research outlines ----------

    def _outlines_path(self, notebook_id: str) -> Path:
        return self._nb_dir(notebook_id) / "outlines.json"

    def _load_outlines(self, notebook_id: str) -> list[dict]:
        return _read_json(self._outlines_path(notebook_id), [])

    def _save_outlines(self, notebook_id: str, outlines: list[dict]) -> None:
        self._write_json(self._outlines_path(notebook_id), outlines)

    def list_outlines(self, notebook_id: str) -> list[ResearchOutline]:
        return [ResearchOutline.model_validate(r) for r in self._load_outlines(notebook_id)]

    def get_outline(self, notebook_id: str, outline_id: str) -> ResearchOutline | None:
        for row in self._load_outlines(notebook_id):
            if row.get("id") == outline_id:
                return ResearchOutline.model_validate(row)
        return None

    def save_outline(self, outline: ResearchOutline) -> ResearchOutline:
        rows = self._load_outlines(outline.notebook_id)
        payload = outline.model_dump(mode="json")
        for index, row in enumerate(rows):
            if row.get("id") == outline.id:
                rows[index] = payload
                break
        else:
            rows.append(payload)
        self._save_outlines(outline.notebook_id, rows)
        return outline

    def delete_outline(self, notebook_id: str, outline_id: str) -> bool:
        rows = self._load_outlines(notebook_id)
        kept = [r for r in rows if r.get("id") != outline_id]
        if len(kept) == len(rows):
            return False
        self._save_outlines(notebook_id, kept)
        return True

    # ---------- skills library (global) ----------

    def _skills_path(self) -> Path:
        return self.root / "skills.json"

    def _load_skills(self) -> list[dict]:
        return _read_json(self._skills_path(), [])

    def list_skills(self) -> list[Skill]:
        return [Skill.model_validate(r) for r in self._load_skills()]

    def get_skill(self, skill_id: str) -> Skill | None:
        for row in self._load_skills():
            if row.get("id") == skill_id:
                return Skill.model_validate(row)
        return None

    def save_skill(self, skill: Skill) -> Skill:
        rows = self._load_skills()
        payload = skill.model_dump(mode="json")
        for index, row in enumerate(rows):
            if row.get("id") == skill.id:
                rows[index] = payload
                break
        else:
            rows.append(payload)
        self._write_json(self._skills_path(), rows)
        return skill

    def delete_skill(self, skill_id: str) -> bool:
        rows = self._load_skills()
        kept = [r for r in rows if r.get("id") != skill_id]
        if len(kept) == len(rows):
            return False
        self._write_json(self._skills_path(), kept)
        return True

    # ---------- notebook memory ----------

    def _memory_path(self, notebook_id: str) -> Path:
        return self._nb_dir(notebook_id) / "memory.json"

    def get_memory(self, notebook_id: str) -> str:
        return str(_read_json(self._memory_path(notebook_id), {}).get("notes", ""))

    def set_memory(self, notebook_id: str, notes: str) -> str:
        self._write_json(self._memory_path(notebook_id), {"notes": notes})
        return notes

    # ---------- flashcards ----------

    def _cards_path(self, notebook_id: str) -> Path:
        return self._nb_dir(notebook_id) / "cards.json"

    def _load_cards(self, notebook_id: str) -> list[dict]:
        return _read_json(self._cards_path(notebook_id), [])

    def _save_cards(self, notebook_id: str, cards: list[dict]) -> None:
        self._write_json(self._cards_path(notebook_id), cards)

    def list_cards(self, notebook_id: str) -> list[Flashcard]:
        return [Flashcard.model_validate(r) for r in self._load_cards(notebook_id)]

    def get_card(self, notebook_id: str, card_id: str) -> Flashcard | None:
        for row in self._load_cards(notebook_id):
            if row.get("id") == card_id:
                return Flashcard.model_validate(row)
        return None

    def save_card(self, card: Flashcard) -> Flashcard:
        rows = self._load_cards(card.notebook_id)
        payload = card.model_dump(mode="json")
        for index, row in enumerate(rows):
            if row.get("id") == card.id:
                rows[index] = payload
                break
        else:
            rows.append(payload)
        self._save_cards(card.notebook_id, rows)
        return card

    def delete_card(self, notebook_id: str, card_id: str) -> bool:
        rows = self._load_cards(notebook_id)
        kept = [r for r in rows if r.get("id") != card_id]
        if len(kept) == len(rows):
            return False
        self._save_cards(notebook_id, kept)
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
        sources = [
            source
            for summary in self.list_sources(notebook_id)
            if (source := self.get_source(notebook_id, summary.id)) is not None
        ]
        n_docs = len(sources)
        df = {term: 0 for term in set(parsed.terms)}
        for source in sources:
            document_terms = {
                term
                for chunk in source.chunks
                for term in stemmed_words(chunk.text)
            }
            for term in df.keys() & document_terms:
                df[term] += 1

        source_filter = set(source_ids) if source_ids else None
        tag_filter = set(tags) if tags else None
        hits: list[SearchHit] = []
        for src in sources:
            if kind and src.kind != kind:
                continue
            if source_filter and src.id not in source_filter:
                continue
            if tag_filter and not (tag_filter & set(src.tags)):
                continue
            for chunk in src.chunks:
                matched, score, matched_stems = score_chunk(
                    chunk.text, parsed, df=df, n_docs=n_docs
                )
                if not matched:
                    continue
                hits.append(
                    SearchHit(
                        source_id=src.id,
                        source_title=src.title,
                        pages=chunk.pages,
                        score=score,
                        snippet=_snippet(chunk.text, parsed.terms),
                        matched_terms=matched_stems,
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
