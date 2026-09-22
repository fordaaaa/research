"""SQLite-backed storage for users, notebooks, sources, and study data.

Single-user JSON files are gone (see scripts/migrate_json_to_sqlite.py for the
one-shot import). Every row belongs to a user; routes enforce ownership before
touching notebook-scoped data. Swapping this class's internals must not change
its interface (see AGENTS.md).
"""
from __future__ import annotations

import hashlib
import hmac
import json
import os
import secrets
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

from core.models import (
    AISettings,
    AISettingsUpdate,
    ChatMessage,
    ChatSession,
    Chunk,
    Citation,
    Flashcard,
    Note,
    NoteCitation,
    NoteSummary,
    Notebook,
    OutlineField,
    OutlineItem,
    ResearchOutline,
    SearchHit,
    Skill,
    Source,
    SourceSummary,
    User,
    utcnow,
)
from core.search import EmptyQuery, parse_query, score_chunk, stemmed_words


def new_id() -> str:
    return secrets.token_hex(6)


SESSION_DAYS = 30
_PBKDF2_ITERATIONS = 600_000


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, _PBKDF2_ITERATIONS)
    return f"pbkdf2${_PBKDF2_ITERATIONS}${salt.hex()}${digest.hex()}"


def verify_password(password: str, stored: str) -> bool:
    try:
        _, iterations, salt_hex, digest_hex = stored.split("$")
        digest = hashlib.pbkdf2_hmac(
            "sha256", password.encode(), bytes.fromhex(salt_hex), int(iterations)
        )
        return hmac.compare_digest(digest.hex(), digest_hex)
    except (ValueError, TypeError):
        return False


def _session_token() -> tuple[str, str]:
    raw = secrets.token_urlsafe(32)
    return raw, hashlib.sha256(raw.encode()).hexdigest()


_SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE COLLATE NOCASE,
    pw_hash TEXT NOT NULL,
    created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS notebooks (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_notebooks_user ON notebooks(user_id);
CREATE TABLE IF NOT EXISTS sources (
    id TEXT PRIMARY KEY,
    notebook_id TEXT NOT NULL REFERENCES notebooks(id) ON DELETE CASCADE,
    kind TEXT NOT NULL,
    title TEXT NOT NULL,
    tags TEXT NOT NULL DEFAULT '[]',
    meta TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL,
    chunk_count INTEGER NOT NULL DEFAULT 0,
    body TEXT NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS idx_sources_notebook ON sources(notebook_id);
CREATE TABLE IF NOT EXISTS outlines (
    id TEXT PRIMARY KEY,
    notebook_id TEXT NOT NULL REFERENCES notebooks(id) ON DELETE CASCADE,
    topic TEXT NOT NULL,
    items TEXT NOT NULL DEFAULT '[]',
    fields TEXT NOT NULL DEFAULT '[]',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS cards (
    id TEXT PRIMARY KEY,
    notebook_id TEXT NOT NULL REFERENCES notebooks(id) ON DELETE CASCADE,
    front TEXT NOT NULL,
    back TEXT NOT NULL,
    tags TEXT NOT NULL DEFAULT '[]',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    interval_days REAL NOT NULL DEFAULT 0,
    review_count INTEGER NOT NULL DEFAULT 0,
    due_at TEXT NOT NULL DEFAULT '',
    last_reviewed_at TEXT
);
CREATE TABLE IF NOT EXISTS notes (
    id TEXT PRIMARY KEY,
    notebook_id TEXT NOT NULL REFERENCES notebooks(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    tags TEXT NOT NULL DEFAULT '[]',
    citations TEXT NOT NULL DEFAULT '[]',
    rev INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_notes_notebook ON notes(notebook_id);
CREATE TABLE IF NOT EXISTS skills (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    instructions TEXT NOT NULL,
    triggers TEXT NOT NULL DEFAULT '[]',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS memory (
    notebook_id TEXT PRIMARY KEY REFERENCES notebooks(id) ON DELETE CASCADE,
    notes TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS chat_sessions (
    id TEXT PRIMARY KEY,
    notebook_id TEXT NOT NULL REFERENCES notebooks(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_chat_sessions_notebook ON chat_sessions(notebook_id, updated_at);
CREATE TABLE IF NOT EXISTS chat_messages (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK(role IN ('user', 'assistant')),
    text TEXT NOT NULL,
    citations TEXT NOT NULL DEFAULT '[]',
    model TEXT,
    created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_chat_messages_session ON chat_messages(session_id, created_at);
CREATE TABLE IF NOT EXISTS ai_settings (
    user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    provider TEXT NOT NULL,
    api_key TEXT NOT NULL,
    model TEXT NOT NULL
);
"""


class Store:
    def __init__(self, root: Path | None = None) -> None:
        env = os.environ.get("RESEARCH_DATA_DIR")
        if root is not None:
            self.root = Path(root)
        elif env:
            self.root = Path(env)
        else:
            self.root = Path(__file__).resolve().parents[1] / "data"
        self.root.mkdir(parents=True, exist_ok=True)
        self.db_path = self.root / "app.db"
        with self._connect() as con:
            con.executescript(_SCHEMA)
            try:
                con.execute("ALTER TABLE users ADD COLUMN google_sub TEXT")
            except Exception:
                pass
            con.execute(
                "CREATE UNIQUE INDEX IF NOT EXISTS idx_users_google_sub"
                " ON users(google_sub)"
            )
            for ddl in (
                "ALTER TABLE cards ADD COLUMN interval_days REAL NOT NULL DEFAULT 0",
                "ALTER TABLE cards ADD COLUMN review_count INTEGER NOT NULL DEFAULT 0",
                "ALTER TABLE cards ADD COLUMN due_at TEXT NOT NULL DEFAULT ''",
                "ALTER TABLE cards ADD COLUMN last_reviewed_at TEXT",
            ):
                try:
                    con.execute(ddl)
                except Exception:
                    pass
            con.execute(
                "CREATE INDEX IF NOT EXISTS idx_cards_notebook_due"
                " ON cards(notebook_id, due_at)"
            )
            try:
                con.execute(
                    "UPDATE cards SET due_at = created_at"
                    " WHERE due_at IS NULL OR due_at = ''"
                )
            except Exception:
                pass

    def _connect(self):
        import sqlite3

        con = sqlite3.connect(str(self.db_path), timeout=30)
        con.row_factory = sqlite3.Row
        con.execute("PRAGMA journal_mode=WAL")
        con.execute("PRAGMA foreign_keys=ON")
        return con

    # ---------- users & sessions ----------

    def create_user(self, email: str, password: str) -> User:
        user = User(id=new_id(), email=email.strip().lower(), created_at=utcnow())
        try:
            with self._connect() as con:
                con.execute(
                    "INSERT INTO users (id, email, pw_hash, created_at) VALUES (?, ?, ?, ?)",
                    (user.id, user.email, hash_password(password), user.created_at.isoformat()),
                )
        except Exception as exc:
            if "UNIQUE" in str(exc):
                raise ValueError("email already registered") from exc
            raise
        return user

    def get_user(self, user_id: str) -> User | None:
        with self._connect() as con:
            row = con.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
        return _user_from_row(row) if row else None

    def get_user_by_email(self, email: str) -> tuple[User, str] | None:
        """Return (user, pw_hash) for login; None if unknown."""
        with self._connect() as con:
            row = con.execute(
                "SELECT * FROM users WHERE email = ?", (email.strip().lower(),)
            ).fetchone()
        if not row:
            return None
        return _user_from_row(row), row["pw_hash"]

    def get_user_by_google_sub(self, google_sub: str) -> User | None:
        with self._connect() as con:
            try:
                row = con.execute(
                    "SELECT * FROM users WHERE google_sub = ?", (google_sub,)
                ).fetchone()
            except Exception:
                return None
        return _user_from_row(row) if row else None

    def create_google_user(self, email: str, google_sub: str) -> User:
        user = User(id=new_id(), email=email.strip().lower(), created_at=utcnow())
        try:
            with self._connect() as con:
                con.execute(
                    "INSERT INTO users (id, email, pw_hash, created_at, google_sub)"
                    " VALUES (?, ?, ?, ?, ?)",
                    (
                        user.id,
                        user.email,
                        f"google${secrets.token_hex(16)}",
                        user.created_at.isoformat(),
                        google_sub,
                    ),
                )
        except Exception as exc:
            if "UNIQUE" in str(exc):
                raise ValueError("email already registered") from exc
            raise
        return user

    def set_user_google_sub(self, user_id: str, google_sub: str) -> None:
        try:
            with self._connect() as con:
                con.execute(
                    "UPDATE users SET google_sub = ? WHERE id = ?",
                    (google_sub, user_id),
                )
        except Exception as exc:
            if "UNIQUE" in str(exc):
                raise ValueError("Google account already linked") from exc
            raise

    def create_session(self, user_id: str) -> tuple[str, datetime]:
        raw, digest = _session_token()
        now = utcnow()
        expires = now + timedelta(days=SESSION_DAYS)
        with self._connect() as con:
            con.execute(
                "INSERT INTO sessions (token_hash, user_id, created_at, expires_at)"
                " VALUES (?, ?, ?, ?)",
                (digest, user_id, now.isoformat(), expires.isoformat()),
            )
        return raw, expires

    def get_session_user(self, token: str) -> User | None:
        digest = hashlib.sha256(token.encode()).hexdigest()
        with self._connect() as con:
            row = con.execute(
                "SELECT u.* FROM users u JOIN sessions s ON s.user_id = u.id"
                " WHERE s.token_hash = ? AND s.expires_at > ?",
                (digest, utcnow().isoformat()),
            ).fetchone()
        return _user_from_row(row) if row else None

    def delete_session(self, token: str) -> None:
        digest = hashlib.sha256(token.encode()).hexdigest()
        with self._connect() as con:
            con.execute("DELETE FROM sessions WHERE token_hash = ?", (digest,))

    # ---------- AI settings (per user) ----------

    def get_ai_settings(self, user_id: str) -> AISettings:
        from core.models import AI_DEFAULT_MODELS  # noqa: PLC0415

        with self._connect() as con:
            row = con.execute(
                "SELECT * FROM ai_settings WHERE user_id = ?", (user_id,)
            ).fetchone()
        if not row or not row["api_key"]:
            return AISettings(configured=False)
        provider = row["provider"] if row["provider"] in ("gemini", "openrouter") else "gemini"
        model = row["model"] or AI_DEFAULT_MODELS[provider]
        return AISettings(configured=True, provider=provider, model=model)  # type: ignore[arg-type]

    def ai_key(self, user_id: str) -> str | None:
        with self._connect() as con:
            row = con.execute(
                "SELECT api_key FROM ai_settings WHERE user_id = ?", (user_id,)
            ).fetchone()
        return row["api_key"] if row and row["api_key"] else None

    def save_ai_settings(self, user_id: str, body: AISettingsUpdate) -> AISettings:
        with self._connect() as con:
            con.execute(
                "INSERT INTO ai_settings (user_id, provider, api_key, model)"
                " VALUES (?, ?, ?, ?)"
                " ON CONFLICT(user_id) DO UPDATE SET provider=excluded.provider,"
                " api_key=excluded.api_key, model=excluded.model",
                (user_id, body.provider, body.api_key, body.model),
            )
        return AISettings(configured=True, provider=body.provider, model=body.model)

    def clear_ai_settings(self, user_id: str) -> None:
        with self._connect() as con:
            con.execute("DELETE FROM ai_settings WHERE user_id = ?", (user_id,))

    # ---------- notebooks ----------

    def list_notebooks(self, user_id: str) -> list[Notebook]:
        with self._connect() as con:
            rows = con.execute(
                "SELECT * FROM notebooks WHERE user_id = ? ORDER BY created_at",
                (user_id,),
            ).fetchall()
        return [_notebook_from_row(r) for r in rows]

    def create_notebook(self, user_id: str, name: str) -> Notebook:
        nb = Notebook(id=new_id(), name=name.strip(), created_at=utcnow())
        with self._connect() as con:
            con.execute(
                "INSERT INTO notebooks (id, user_id, name, created_at) VALUES (?, ?, ?, ?)",
                (nb.id, user_id, nb.name, nb.created_at.isoformat()),
            )
        return nb

    def get_notebook(self, user_id: str, notebook_id: str) -> Notebook | None:
        with self._connect() as con:
            row = con.execute(
                "SELECT * FROM notebooks WHERE id = ? AND user_id = ?",
                (notebook_id, user_id),
            ).fetchone()
        return _notebook_from_row(row) if row else None

    def delete_notebook(self, user_id: str, notebook_id: str) -> bool:
        with self._connect() as con:
            cur = con.execute(
                "DELETE FROM notebooks WHERE id = ? AND user_id = ?",
                (notebook_id, user_id),
            )
            return cur.rowcount > 0

    # ---------- sources ----------

    def list_sources(self, notebook_id: str) -> list[SourceSummary]:
        with self._connect() as con:
            rows = con.execute(
                "SELECT id, notebook_id, kind, title, tags, meta, created_at, chunk_count"
                " FROM sources WHERE notebook_id = ? ORDER BY created_at",
                (notebook_id,),
            ).fetchall()
        return [_summary_from_row(r) for r in rows]

    def create_source(self, source: Source) -> SourceSummary:
        summary = SourceSummary(
            **{k: v for k, v in source.model_dump().items() if k not in ("pages", "chunks")},
            chunk_count=len(source.chunks),
        )
        with self._connect() as con:
            con.execute(
                "INSERT INTO sources (id, notebook_id, kind, title, tags, meta,"
                " created_at, chunk_count, body) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
                (
                    source.id,
                    source.notebook_id,
                    source.kind,
                    source.title,
                    json.dumps(source.tags),
                    json.dumps(source.meta),
                    source.created_at.isoformat(),
                    len(source.chunks),
                    source.model_dump_json(),
                ),
            )
        return summary

    def get_source(self, notebook_id: str, source_id: str) -> Source | None:
        with self._connect() as con:
            row = con.execute(
                "SELECT body FROM sources WHERE id = ? AND notebook_id = ?",
                (source_id, notebook_id),
            ).fetchone()
        return Source.model_validate_json(row["body"]) if row else None

    def find_source(self, source_id: str) -> Source | None:
        with self._connect() as con:
            row = con.execute(
                "SELECT body FROM sources WHERE id = ?", (source_id,)
            ).fetchone()
        return Source.model_validate_json(row["body"]) if row else None

    def find_source_for_user(self, user_id: str, source_id: str) -> Source | None:
        """Global lookup that refuses cross-user access."""
        with self._connect() as con:
            row = con.execute(
                "SELECT s.body FROM sources s JOIN notebooks n ON n.id = s.notebook_id"
                " WHERE s.id = ? AND n.user_id = ?",
                (source_id, user_id),
            ).fetchone()
        return Source.model_validate_json(row["body"]) if row else None

    def find_source_chunks_for_user(
        self, user_id: str, source_id: str, *, offset: int, limit: int
    ) -> tuple[int, list[Chunk]] | None:
        """Return (total, chunk slice) without hydrating the full source body.

        Ownership is enforced through the notebooks join; chunks are sliced
        inside SQLite so a 50 MB source costs one page, not a full parse.
        """
        with self._connect() as con:
            owner = con.execute(
                "SELECT 1 FROM sources s JOIN notebooks n ON n.id = s.notebook_id"
                " WHERE s.id = ? AND n.user_id = ?",
                (source_id, user_id),
            ).fetchone()
            if not owner:
                return None
            row = con.execute(
                "SELECT json_array_length(body, '$.chunks') AS total,"
                " (SELECT json_group_array(json(value)) FROM"
                " (SELECT value FROM json_each(body, '$.chunks') LIMIT ? OFFSET ?)) AS page"
                " FROM sources WHERE id = ?",
                (limit, offset, source_id),
            ).fetchone()
        if not row:
            return None
        items = json.loads(row["page"]) if row["page"] else []
        return (row["total"] or 0), [Chunk.model_validate(item) for item in items]

    def update_source(
        self,
        notebook_id: str,
        source_id: str,
        *,
        title: str | None = None,
        tags: list[str] | None = None,
    ) -> Source | None:
        src = self.get_source(notebook_id, source_id)
        if not src:
            return None
        if title is not None:
            src.title = title.strip()
        if tags is not None:
            src.tags = [t.strip().lower() for t in tags if t.strip()]
        with self._connect() as con:
            con.execute(
                "UPDATE sources SET title = ?, tags = ?, body = ?"
                " WHERE id = ? AND notebook_id = ?",
                (src.title, json.dumps(src.tags), src.model_dump_json(), source_id, notebook_id),
            )
        return src

    def delete_source(self, notebook_id: str, source_id: str) -> bool:
        with self._connect() as con:
            cur = con.execute(
                "DELETE FROM sources WHERE id = ? AND notebook_id = ?",
                (source_id, notebook_id),
            )
            return cur.rowcount > 0

    # ---------- research outlines ----------

    def list_outlines(self, notebook_id: str) -> list[ResearchOutline]:
        with self._connect() as con:
            rows = con.execute(
                "SELECT * FROM outlines WHERE notebook_id = ? ORDER BY created_at",
                (notebook_id,),
            ).fetchall()
        return [_outline_from_row(r) for r in rows]

    def get_outline(self, notebook_id: str, outline_id: str) -> ResearchOutline | None:
        with self._connect() as con:
            row = con.execute(
                "SELECT * FROM outlines WHERE id = ? AND notebook_id = ?",
                (outline_id, notebook_id),
            ).fetchone()
        return _outline_from_row(row) if row else None

    def save_outline(self, outline: ResearchOutline) -> ResearchOutline:
        with self._connect() as con:
            con.execute(
                "INSERT INTO outlines (id, notebook_id, topic, items, fields, created_at, updated_at)"
                " VALUES (?, ?, ?, ?, ?, ?, ?)"
                " ON CONFLICT(id) DO UPDATE SET topic=excluded.topic, items=excluded.items,"
                " fields=excluded.fields, updated_at=excluded.updated_at",
                (
                    outline.id,
                    outline.notebook_id,
                    outline.topic,
                    json.dumps([i.model_dump() for i in outline.items]),
                    json.dumps([f.model_dump() for f in outline.fields]),
                    outline.created_at.isoformat(),
                    outline.updated_at.isoformat(),
                ),
            )
        return outline

    def delete_outline(self, notebook_id: str, outline_id: str) -> bool:
        with self._connect() as con:
            cur = con.execute(
                "DELETE FROM outlines WHERE id = ? AND notebook_id = ?",
                (outline_id, notebook_id),
            )
            return cur.rowcount > 0

    # ---------- flashcards ----------

    def list_cards(self, notebook_id: str) -> list[Flashcard]:
        with self._connect() as con:
            rows = con.execute(
                "SELECT * FROM cards WHERE notebook_id = ? ORDER BY created_at",
                (notebook_id,),
            ).fetchall()
        return [_card_from_row(r) for r in rows]

    def get_card(self, notebook_id: str, card_id: str) -> Flashcard | None:
        with self._connect() as con:
            row = con.execute(
                "SELECT * FROM cards WHERE id = ? AND notebook_id = ?",
                (card_id, notebook_id),
            ).fetchone()
        return _card_from_row(row) if row else None

    def save_card(self, card: Flashcard) -> Flashcard:
        if not card.due_at:
            card.due_at = card.created_at
        with self._connect() as con:
            con.execute(
                "INSERT INTO cards (id, notebook_id, front, back, tags, created_at, updated_at,"
                " interval_days, review_count, due_at, last_reviewed_at)"
                " VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
                " ON CONFLICT(id) DO UPDATE SET front=excluded.front, back=excluded.back,"
                " tags=excluded.tags, updated_at=excluded.updated_at,"
                " interval_days=excluded.interval_days, review_count=excluded.review_count,"
                " due_at=excluded.due_at, last_reviewed_at=excluded.last_reviewed_at",
                (
                    card.id,
                    card.notebook_id,
                    card.front,
                    card.back,
                    json.dumps(card.tags),
                    card.created_at.isoformat(),
                    card.updated_at.isoformat(),
                    card.interval_days,
                    card.review_count,
                    card.due_at.isoformat() if card.due_at else "",
                    card.last_reviewed_at.isoformat() if card.last_reviewed_at else None,
                ),
            )
        return card

    def list_due_cards(
        self, notebook_id: str, now: datetime | None = None, limit: int = 20
    ) -> list[Flashcard]:
        """Cards with due_at at or before now, oldest-due first."""
        moment = now or utcnow()
        with self._connect() as con:
            try:
                rows = con.execute(
                    "SELECT * FROM cards WHERE notebook_id = ?"
                    " AND (due_at IS NULL OR due_at = '' OR due_at <= ?)"
                    " ORDER BY CASE WHEN due_at IS NULL OR due_at = ''"
                    " THEN created_at ELSE due_at END, created_at LIMIT ?",
                    (notebook_id, moment.isoformat(), limit),
                ).fetchall()
            except Exception:
                rows = con.execute(
                    "SELECT * FROM cards WHERE notebook_id = ?"
                    " ORDER BY created_at LIMIT ?",
                    (notebook_id, limit),
                ).fetchall()
        return [_card_from_row(r) for r in rows]

    def delete_card(self, notebook_id: str, card_id: str) -> bool:
        with self._connect() as con:
            cur = con.execute(
                "DELETE FROM cards WHERE id = ? AND notebook_id = ?",
                (card_id, notebook_id),
            )
            return cur.rowcount > 0

    # ---------- notebook notes ----------

    def list_notes(self, notebook_id: str) -> list[NoteSummary]:
        with self._connect() as con:
            rows = con.execute(
                "SELECT * FROM notes WHERE notebook_id = ? ORDER BY updated_at DESC, created_at DESC",
                (notebook_id,),
            ).fetchall()
        return [_note_summary_from_row(row) for row in rows]

    def get_note(self, notebook_id: str, note_id: str) -> Note | None:
        with self._connect() as con:
            row = con.execute(
                "SELECT * FROM notes WHERE id = ? AND notebook_id = ?",
                (note_id, notebook_id),
            ).fetchone()
        return _note_from_row(row) if row else None

    def create_note(self, note: Note) -> Note:
        with self._connect() as con:
            con.execute(
                "INSERT INTO notes (id, notebook_id, title, body, tags, citations, rev, created_at, updated_at)"
                " VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
                (
                    note.id,
                    note.notebook_id,
                    note.title,
                    note.body,
                    json.dumps(note.tags),
                    json.dumps([citation.model_dump() for citation in note.citations]),
                    note.rev,
                    note.created_at.isoformat(),
                    note.updated_at.isoformat(),
                ),
            )
        return note

    def update_note(
        self,
        notebook_id: str,
        note_id: str,
        base_rev: int,
        *,
        title: str,
        body: str,
        tags: list[str],
        citations: list[NoteCitation],
        updated_at: datetime,
    ) -> Note | None:
        with self._connect() as con:
            cur = con.execute(
                "UPDATE notes SET title = ?, body = ?, tags = ?, citations = ?, rev = rev + 1, updated_at = ?"
                " WHERE id = ? AND notebook_id = ? AND rev = ?",
                (
                    title,
                    body,
                    json.dumps(tags),
                    json.dumps([citation.model_dump() for citation in citations]),
                    updated_at.isoformat(),
                    note_id,
                    notebook_id,
                    base_rev,
                ),
            )
            if cur.rowcount == 0:
                return None
        return self.get_note(notebook_id, note_id)

    def delete_note(self, notebook_id: str, note_id: str) -> bool:
        with self._connect() as con:
            cur = con.execute(
                "DELETE FROM notes WHERE id = ? AND notebook_id = ?", (note_id, notebook_id)
            )
            return cur.rowcount > 0

    # ---------- skills library (per user) ----------

    def list_skills(self, user_id: str) -> list[Skill]:
        with self._connect() as con:
            rows = con.execute(
                "SELECT * FROM skills WHERE user_id = ? ORDER BY created_at", (user_id,)
            ).fetchall()
        return [_skill_from_row(r) for r in rows]

    def get_skill(self, user_id: str, skill_id: str) -> Skill | None:
        with self._connect() as con:
            row = con.execute(
                "SELECT * FROM skills WHERE id = ? AND user_id = ?",
                (skill_id, user_id),
            ).fetchone()
        return _skill_from_row(row) if row else None

    def save_skill(self, skill: Skill) -> Skill:
        with self._connect() as con:
            con.execute(
                "INSERT INTO skills (id, user_id, name, instructions, triggers, created_at, updated_at)"
                " VALUES (?, ?, ?, ?, ?, ?, ?)"
                " ON CONFLICT(id) DO UPDATE SET name=excluded.name,"
                " instructions=excluded.instructions, triggers=excluded.triggers,"
                " updated_at=excluded.updated_at",
                (
                    skill.id,
                    skill.user_id,
                    skill.name,
                    skill.instructions,
                    json.dumps(skill.triggers),
                    skill.created_at.isoformat(),
                    skill.updated_at.isoformat(),
                ),
            )
        return skill

    def delete_skill(self, user_id: str, skill_id: str) -> bool:
        with self._connect() as con:
            cur = con.execute(
                "DELETE FROM skills WHERE id = ? AND user_id = ?",
                (skill_id, user_id),
            )
            return cur.rowcount > 0

    # ---------- notebook memory ----------

    def get_memory(self, notebook_id: str) -> str:
        with self._connect() as con:
            row = con.execute(
                "SELECT notes FROM memory WHERE notebook_id = ?", (notebook_id,)
            ).fetchone()
        return row["notes"] if row else ""

    def set_memory(self, notebook_id: str, notes: str) -> str:
        with self._connect() as con:
            con.execute(
                "INSERT INTO memory (notebook_id, notes) VALUES (?, ?)"
                " ON CONFLICT(notebook_id) DO UPDATE SET notes=excluded.notes",
                (notebook_id, notes),
            )
        return notes

    # ---------- notebook chat sessions ----------

    def create_chat_session(self, session: ChatSession) -> ChatSession:
        with self._connect() as con:
            con.execute(
                "INSERT INTO chat_sessions (id, notebook_id, title, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
                (session.id, session.notebook_id, session.title, session.created_at.isoformat(), session.updated_at.isoformat()),
            )
        return session

    def list_chat_sessions(self, notebook_id: str) -> list[ChatSession]:
        with self._connect() as con:
            rows = con.execute("SELECT * FROM chat_sessions WHERE notebook_id = ? ORDER BY updated_at DESC", (notebook_id,)).fetchall()
        return [_chat_session_from_row(row) for row in rows]

    def get_chat_session(self, notebook_id: str, session_id: str) -> ChatSession | None:
        with self._connect() as con:
            row = con.execute("SELECT * FROM chat_sessions WHERE id = ? AND notebook_id = ?", (session_id, notebook_id)).fetchone()
        return _chat_session_from_row(row) if row else None

    def delete_chat_session(self, notebook_id: str, session_id: str) -> bool:
        with self._connect() as con:
            cur = con.execute("DELETE FROM chat_sessions WHERE id = ? AND notebook_id = ?", (session_id, notebook_id))
            return cur.rowcount > 0

    def list_chat_messages(self, session_id: str) -> list[ChatMessage]:
        with self._connect() as con:
            rows = con.execute(
                "SELECT * FROM chat_messages WHERE session_id = ? ORDER BY created_at, rowid",
                (session_id,),
            ).fetchall()
        return [_chat_message_from_row(row) for row in rows]

    def append_chat_exchange(
        self,
        session: ChatSession,
        user_text: str,
        assistant_text: str,
        citations: list[Citation],
        model: str | None,
    ) -> ChatMessage:
        now = utcnow()
        assistant = ChatMessage(id=new_id(), session_id=session.id, role="assistant", text=assistant_text, citations=citations, model=model, created_at=now)
        user = ChatMessage(id=new_id(), session_id=session.id, role="user", text=user_text, created_at=now)
        title = session.title
        if title == "New conversation":
            title = user_text.strip()[:80] or title
        with self._connect() as con:
            con.execute(
                "INSERT INTO chat_messages (id, session_id, role, text, citations, model, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
                (user.id, user.session_id, user.role, user.text, "[]", user.model, user.created_at.isoformat()),
            )
            con.execute(
                "INSERT INTO chat_messages (id, session_id, role, text, citations, model, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
                (assistant.id, assistant.session_id, assistant.role, assistant.text, json.dumps([citation.model_dump() for citation in citations]), assistant.model, assistant.created_at.isoformat()),
            )
            con.execute("UPDATE chat_sessions SET title = ?, updated_at = ? WHERE id = ? AND notebook_id = ?", (title, now.isoformat(), session.id, session.notebook_id))
        return assistant

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
        source_ids_set = set(source_ids) if source_ids else None
        tags_set = set(tags) if tags else None
        sources = [
            source
            for summary in self.list_sources(notebook_id)
            if (not kind or summary.kind == kind)
            and (not source_ids_set or summary.id in source_ids_set)
            and (not tags_set or (tags_set & set(summary.tags)))
            and (source := self.get_source(notebook_id, summary.id)) is not None
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

        hits: list[SearchHit] = []
        for src in sources:
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


def _user_from_row(row: Any) -> User:
    return User(id=row["id"], email=row["email"], created_at=datetime.fromisoformat(row["created_at"]))


def _notebook_from_row(row: Any) -> Notebook:
    return Notebook(
        id=row["id"], name=row["name"], created_at=datetime.fromisoformat(row["created_at"])
    )


def _chat_session_from_row(row: Any) -> ChatSession:
    return ChatSession(
        id=row["id"], notebook_id=row["notebook_id"], title=row["title"],
        created_at=datetime.fromisoformat(row["created_at"]),
        updated_at=datetime.fromisoformat(row["updated_at"]),
    )


def _chat_message_from_row(row: Any) -> ChatMessage:
    return ChatMessage(
        id=row["id"], session_id=row["session_id"], role=row["role"], text=row["text"],
        citations=[Citation.model_validate(item) for item in json.loads(row["citations"])],
        model=row["model"], created_at=datetime.fromisoformat(row["created_at"]),
    )


def _summary_from_row(row: Any) -> SourceSummary:
    return SourceSummary(
        id=row["id"],
        notebook_id=row["notebook_id"],
        kind=row["kind"],
        title=row["title"],
        tags=json.loads(row["tags"]),
        meta=json.loads(row["meta"]),
        created_at=datetime.fromisoformat(row["created_at"]),
        chunk_count=row["chunk_count"],
    )


def _outline_from_row(row: Any) -> ResearchOutline:
    return ResearchOutline(
        id=row["id"],
        notebook_id=row["notebook_id"],
        topic=row["topic"],
        items=[OutlineItem.model_validate(i) for i in json.loads(row["items"])],
        fields=[OutlineField.model_validate(f) for f in json.loads(row["fields"])],
        created_at=datetime.fromisoformat(row["created_at"]),
        updated_at=datetime.fromisoformat(row["updated_at"]),
    )


def _card_from_row(row: Any) -> Flashcard:
    cols = set(row.keys()) if hasattr(row, "keys") else set()
    created = datetime.fromisoformat(row["created_at"])
    raw_due = row["due_at"] if "due_at" in cols else None
    try:
        due = datetime.fromisoformat(raw_due) if raw_due else created
    except (ValueError, TypeError):
        due = created
    raw_last = row["last_reviewed_at"] if "last_reviewed_at" in cols else None
    try:
        last = datetime.fromisoformat(raw_last) if raw_last else None
    except (ValueError, TypeError):
        last = None
    return Flashcard(
        id=row["id"],
        notebook_id=row["notebook_id"],
        front=row["front"],
        back=row["back"],
        tags=json.loads(row["tags"]),
        created_at=created,
        updated_at=datetime.fromisoformat(row["updated_at"]),
        interval_days=float(row["interval_days"]) if "interval_days" in cols and row["interval_days"] is not None else 0.0,
        review_count=int(row["review_count"]) if "review_count" in cols and row["review_count"] is not None else 0,
        due_at=due,
        last_reviewed_at=last,
    )


def _skill_from_row(row: Any) -> Skill:
    return Skill(
        id=row["id"],
        user_id=row["user_id"],
        name=row["name"],
        instructions=row["instructions"],
        triggers=json.loads(row["triggers"]),
        created_at=datetime.fromisoformat(row["created_at"]),
        updated_at=datetime.fromisoformat(row["updated_at"]),
    )


def _note_citations(row: Any) -> list[NoteCitation]:
    return [NoteCitation.model_validate(item) for item in json.loads(row["citations"])]


def _note_from_row(row: Any) -> Note:
    return Note(
        id=row["id"],
        notebook_id=row["notebook_id"],
        title=row["title"],
        body=row["body"],
        tags=json.loads(row["tags"]),
        citations=_note_citations(row),
        rev=row["rev"],
        created_at=datetime.fromisoformat(row["created_at"]),
        updated_at=datetime.fromisoformat(row["updated_at"]),
    )


def _note_summary_from_row(row: Any) -> NoteSummary:
    return NoteSummary(
        id=row["id"],
        notebook_id=row["notebook_id"],
        title=row["title"],
        tags=json.loads(row["tags"]),
        citations=_note_citations(row),
        rev=row["rev"],
        created_at=datetime.fromisoformat(row["created_at"]),
        updated_at=datetime.fromisoformat(row["updated_at"]),
    )


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
