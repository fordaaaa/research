# AGENTS.md

Guide for AI agents (and humans) working in this repo.

## What this is

**research** — a free, local-first NotebookLM alternative for school. Sources
live in the owner's SQLite file; source management, search, public-web
discovery, and exports must work with zero AI and zero provider keys.
No-AI mode is first-class; accounts are required (see non-negotiables).
Keyless research is the main product goal.

Non-negotiables:

- **Hosted multi-user direction** — the product is one hosted backend
  (`research-server`) with thin clients. Every notebook, source, outline,
  card, skill, note, and AI key belongs to exactly one user; routes enforce
  ownership and cross-user access is always 404. (Supersedes the old
  keyless/no-account rule by owner decision, 2026-09-09.)
- **$0 to run, $99 later** — self-hosting stays free (SQLite file, no paid
  service). The Apple Developer Program ($99/yr) is budgeted only when App
  Store submission approaches.
- **No local LLMs** — Ollama etc. intentionally excluded by owner decision.
- **No-AI mode is first-class** — every feature must remain useful when no
  provider key is configured. Auth is required; AI is not.
- **License: MIT** — keep it open source (matches fordaaaa/panoply).
- **Private hosted boundary** — the private `fordaaaa/research-server` owns
  hosted operations (cloud accounts, managed storage/sync,
  subscriptions/entitlements, hosted AI credits/routing, rate
  limits/abuse controls, admin/ops, secrets/infra). Never imply access to
  it, and never gate this repo's local flows on it. Full boundary, AI
  modes, platforms, and legal checklist: `docs/PRODUCT.md`.
- **Privacy** — user data stays in the data directory (`backend/data/` in
  development as `app.db`; `./data` in the hosted container). Passwords are
  pbkdf2 hashes, sessions are hashed bearer tokens. Never commit `.env`,
  keys, or data files.

Inspiration: NotebookLM (notebooks of sources, grounded chat, generated artifacts: quizzes/mind maps/audio) and Obsidian (local markdown, everything exportable). See also teng-lin/notebooklm-py for the feature surface.

## Commands

Backend (run from `backend/`):

```sh
uv sync                                   # install deps (creates .venv, python 3.12)
uv run uvicorn api.main:app --reload      # dev server on :8000
uv run pytest                             # tests (always green before commit)
uv add <package>                          # add a dependency
```

macOS app (run from the repository root):

```sh
sh scripts/build_macos_app.sh             # builds an arm64, ad-hoc-signed .app
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
│   ├── auth.py         # register/login/logout/me (email; Google next, Apple last)
│   ├── notebooks.py    # notebook CRUD + /export
│   ├── sources.py      # upload / paste / url / list / get / chunks / patch / delete
│   ├── search.py       # GET /notebooks/{id}/search (filters in query params)
│   ├── web.py          # GET /web/search (keyless public discovery)
│   ├── ai.py           # optional BYOK provider settings + chat; never required
│   ├── study.py        # flashcards, study guide, mind map (+ exports)
│   ├── outlines.py     # deep-research outlines (draft/deep/report)
│   └── ...             # research, skills, humanize, demo (see HANDOFF.md)
├── core/               # pure logic, no framework imports
│   ├── models.py       # pydantic models (single source of truth for shapes)
│   ├── parsers.py      # pdf/docx/txt/md bytes → Page[]
│   ├── chunker.py      # pages → chunks (~1200 chars, ~150 overlap, never spans pages)
│   ├── search.py       # query parsing, stemming, relevance scoring
│   ├── websearch.py    # keyless public-web discovery
│   ├── store.py        # SQLite store (app.db, WAL; per-user rows everywhere)
│   ├── ingest.py       # bytes/url/text → parse → chunk → store
│   ├── fetcher.py      # http fetch + trafilatura article extraction (for url srcs)
│   ├── export.py       # notebook → Obsidian-style markdown .zip
└── data/               # ALL user data (gitignored)
frontend/
└── src/                # React 19 + TS + Tailwind 4 (api.ts is the only fetch layer)
macos/
├── Research.xcodeproj  # native macOS app project
└── Research/           # SwiftUI shell, sidecar process manager, WKWebView
scripts/
└── build_macos_app.sh  # frontend + PyInstaller sidecar + Xcode app build
```

Request flow: UI → Vite proxy (`/api/*`) → FastAPI (`api/<resource>.py`) → `core/` → SQLite (`app.db`).
**All API routes must live under `/api`** — the dev proxy depends on it.

The packaged app serves the built frontend from a loopback FastAPI sidecar rather
than Vite. Its Swift shell sets `RESEARCH_DATA_DIR` to Application Support and
passes a per-launch session token; do not write user data inside the `.app`.

### No-AI design

The default and primary flow is: find public sources → import them locally →
search/read/export them locally. `api/web.py` provides public discovery with
no provider key. Do not introduce a provider, model, or key requirement to
unlock that flow. Accounts stay required on data routes (owner decision,
2026-09-09); AI keys stay optional and per-user. The existing BYOK adapters
(Gemini, OpenRouter) are not a dependency to build upon unless the owner
explicitly changes this direction.

### Route registration

Resources register onto the app from `api/main.py` (`notebooks.register(app)`, etc.). When adding an endpoint, add it inside the matching `register(app)` function. `safe_id`, `get_store`, `notebook_or_404` come from `api.deps`.

### Storage (SQLite, current)

Multi-user data lives in SQLite (`app.db`, WAL) under the data directory,
with per-user rows on every table; routes enforce ownership and cross-user
access is 404. The old single-user JSON layout is gone — see
`backend/scripts/migrate_json_to_sqlite.py` for the one-shot import.

- Writes go through `core/store.py`; swapping its internals must not leak storage details.
- `RESEARCH_DATA_DIR` env var overrides the data dir — tests use it to run in temp dirs.

## Conventions

- **Commits:** conventional prefixes (`feat:`, `fix:`, `chore:`, `docs:`), **single line, no body, no Co-Authored-By**. One logical change per commit.
- **Coding-worker policy (locked):** write a meaningful failing test first, implement, run targeted tests, run the repo-required broader checks, report exact evidence — and commit only after reviewer approval. Docs-only changes still run `git diff --check` plus consistency greps, never the code test suite solely for prose.
- Backend: type hints everywhere, pydantic models in `core/models.py`, docstrings only where non-obvious.
- Frontend: TypeScript strict, function components, double quotes, Tailwind utility classes (no CSS files beyond `index.css`).
- Tests live in `backend/tests/`; API tests use `fastapi.testclient` + temp data dir.
- Verify before committing: `uv run pytest` (backend changes, MUST be green) and `npm run build` (frontend changes, MUST run clean).
- Verify native changes with `sh scripts/build_macos_app.sh`; it checks the
  arm64 sidecar and app signature. Use the Xcode path in that script instead of
  changing the machine-wide developer directory.
- Do not commit until the working tree is green. If a change is in-progress and red, say so in HANDOFF.md rather than committing a broken tree.

## Current status

See `HANDOFF.md` for the live state, locked decisions, and next milestone.
