# AGENTS.md

Guide for AI agents (and humans) working in this repo.

## What this is

**research** — a free, local-first NotebookLM alternative for school. Sources live on your machine; search/read always work with zero AI; AI features (cited chat, deep research, study tools) unlock when the user pastes a free-tier API key in Settings.

Non-negotiables:

- **$0 rule** — never add paid services, accounts, or API-key-required defaults. Providers are pluggable and default off.
- **No local LLMs** — Ollama etc. intentionally excluded by owner decision.
- **No-AI mode is first-class** — every feature must degrade to keyword-only usefulness when `ai.enabled: false`.
- **Privacy** — user data stays in `backend/data/` (gitignored). Never commit `.env`, keys, or data files.

Inspiration: NotebookLM (notebooks of sources, grounded chat, generated artifacts: quizzes/mind maps/audio) and Obsidian (local markdown, everything exportable). See also teng-lin/notebooklm-py for the feature surface.

## Commands

Backend (run from `backend/`):

```sh
uv sync                                   # install deps (creates .venv, python 3.12)
uv run uvicorn api.main:app --reload      # dev server on :8000
uv run pytest                             # tests (always green before commit)
uv add <package>                          # add a dependency
```

Frontend (run from `frontend/`):

```sh
npm install
npm run dev                               # dev server on :5173, proxies /api → :8000
npm run build                             # type-checks + production build (verify before commit)
npm i <package>
```

**Never call system `python3`** — it is 3.14 and incompatible with some wheels. Always `uv run` (project pins 3.12 via `.python-version`).

## Architecture

```
backend/
├── api/main.py        # FastAPI routes — thin HTTP layer, all logic in core/
├── core/              # pure logic, no framework imports
│   ├── models.py      # pydantic models (single source of truth for shapes)
│   ├── parsers.py     # pdf/docx/txt/md bytes → Page[]
│   ├── chunker.py     # pages → chunks (~1200 chars, ~150 overlap, never spans pages)
│   ├── store.py       # JSON file store (notebooks.json + per-source files)
│   ├── ingest.py      # bytes → parse → chunk → store
│   └── config.py      # loads config.yaml
├── config.yaml        # ai.enabled: false default; providers pluggable
└── data/              # ALL user data (gitignored)
frontend/
└── src/               # React 19 + TS + Tailwind 4 (api.ts is the only fetch layer)
```

Request flow: UI → Vite proxy (`/api/*`) → FastAPI → `core/` → JSON files.
**All API routes must live under `/api`** — the dev proxy depends on it.

### Storage notes (M1)

Data is plain JSON, not SQLite (deferred by owner decision until embeddings or scale justify it):

```
data/notebooks.json                # [{id, name, created_at}]
data/notebooks/{id}/meta.json      # sources list
data/notebooks/{id}/{sid}.json     # {source fields, pages[], chunks[]}
```

- Writes are atomic (temp file + `os.replace`).
- `RESEARCH_DATA_DIR` env var overrides the data dir — tests use it to run in temp dirs.
- When SQLite/FTS5 arrives, swap `store.py` internals only; its interface must not leak storage details.

## Conventions

- **Commits:** conventional prefixes (`feat:`, `fix:`, `chore:`, `docs:`), **single line, no body, no Co-Authored-By**. One logical change per commit.
- Backend: type hints everywhere, pydantic models in `core/models.py`, docstrings only where non-obvious.
- Frontend: TypeScript strict, function components, double quotes, Tailwind utility classes (no CSS files beyond `index.css`).
- Tests live in `backend/tests/`; API tests use `fastapi.testclient` + temp data dir.
- Verify before committing: `uv run pytest` (backend changes) and `npm run build` (frontend changes).

## Current status

See `HANDOFF.md` for the live state, locked decisions, and next milestone.
