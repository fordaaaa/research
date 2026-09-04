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
├── api/                # FastAPI layer — thin HTTP, module-per-resource
│   ├── main.py         # app factory, lifespan, CORS, global 500 handler
│   ├── deps.py         # safe_id() validation, get_store, notebook_or_404
│   ├── notebooks.py    # notebook CRUD + /export
│   ├── sources.py      # upload / paste / url / list / get / chunks / patch / delete
│   └── search.py       # GET /notebooks/{id}/search (filters in query params)
├── core/               # pure logic, no framework imports
│   ├── models.py       # pydantic models (single source of truth for shapes)
│   ├── parsers.py      # pdf/docx/txt/md bytes → Page[]
│   ├── chunker.py      # pages → chunks (~1200 chars, ~150 overlap, never spans pages)
│   ├── search.py       # query parsing, stemming, relevance scoring (pluggable)
│   ├── store.py        # JSON file store (notebooks.json + per-source files)
│   ├── ingest.py       # bytes/url/text → parse → chunk → store
│   ├── fetcher.py      # http fetch + trafilatura article extraction (for url srcs)
│   ├── export.py       # notebook → Obsidian-style markdown .zip
│   └── config.py       # loads config.yaml
├── config.yaml         # ai.enabled: false default; providers pluggable
└── data/               # ALL user data (gitignored)
frontend/
└── src/                # React 19 + TS + Tailwind 4 (api.ts is the only fetch layer)
```

Request flow: UI → Vite proxy (`/api/*`) → FastAPI (`api/<resource>.py`) → `core/` → JSON files.
**All API routes must live under `/api`** — the dev proxy depends on it.

### Route registration

Resources register onto the app from `api/main.py` (`notebooks.register(app)`, etc.). When adding an endpoint, add it inside the matching `register(app)` function. `safe_id`, `get_store`, `notebook_or_404` come from `api.deps`.

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
- The store keeps in-memory id indexes (`_by_id` for notebooks, `_source_index` source_id→notebook_id), rebuilt at init and pruned on delete — see `get_notebook`, `find_source`, `delete_notebook`/`delete_source`. Search scans chunk files on demand (no index for text yet).

## Conventions

- **Commits:** conventional prefixes (`feat:`, `fix:`, `chore:`, `docs:`), **single line, no body, no Co-Authored-By**. One logical change per commit.
- Backend: type hints everywhere, pydantic models in `core/models.py`, docstrings only where non-obvious.
- Frontend: TypeScript strict, function components, double quotes, Tailwind utility classes (no CSS files beyond `index.css`).
- Tests live in `backend/tests/`; API tests use `fastapi.testclient` + temp data dir.
- Verify before committing: `uv run pytest` (backend changes, MUST be green) and `npm run build` (frontend changes, MUST run clean).
- Do not commit until the working tree is green. If a change is in-progress and red, say so in HANDOFF.md rather than committing a broken tree.

## Current status

See `HANDOFF.md` for the live state, locked decisions, and next milestone.
