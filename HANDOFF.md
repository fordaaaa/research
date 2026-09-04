# HANDOFF.md

Live state of the project. Read this first when picking the work back up.

## Current state

- Branch `main`. M0–M2 complete and committed (granular feat/chore/docs commits — see `git log`).
- **Owner direction (latest): capability-first.** Prioritize searching and information management; UI work is deferred — the existing minimal UI stays as-is and may lag behind the API. End goal unchanged: a real app (desktop packaging later).
- Run it: `cd backend && uv run uvicorn api.main:app --reload` + `cd frontend && npm run dev` → http://localhost:5173
- Tests: `cd backend && uv run pytest` · Frontend check: `cd frontend && npm run build`


## Locked owner decisions

1. **$0 forever** — no paid services; pluggable providers, all default off.
2. **No local LLMs** (no Ollama) — AI comes from optional free-tier API keys (Groq / Google AI Studio / OpenRouter) pasted into Settings, M3+.
3. **No-AI mode is first-class** — ingest/search/reader/exports work with `ai.enabled: false`.
4. **Python backend (FastAPI + uv) + React frontend** — two languages accepted for best PDF/DOCX ecosystem.
5. **Commits: conventional prefixes, single line, no body, no Co-Authored-By.**
6. **SQLite deferred** — M1 uses a JSON file store; revisit when embeddings (M3+) or scale demand it. Swap inside `core/store.py` only.

## Environment facts (this machine)

- MacBook Pro M1 Pro, 16 GB, macOS. `uv 0.12.1`, Python **3.12.13** (uv-managed; system python3 is 3.14 — do not use), Node 26, npm 11.
- npm installs can exceed 30s tool timeouts — use `npm install --maxsockets=25 --fetch-retries=1 --loglevel=error` and split installs. `setsid` does not exist on macOS; use `nohup` for background jobs.
- Long work sessions: owner wants `caffeinate -dimsu` running (start `nohup caffeinate -dimsu &`, `pkill caffeinate` when done).

## Stack versions

FastAPI + pydantic v2 (backend, `uv.lock` pinned) · React 19 + Vite 8.2.2 + Tailwind 4.3.3 + TypeScript (frontend) · storage: JSON files under `backend/data/`.

## M1 — what was just built (uncommitted)

- `core/parsers.py` — PDF (PyMuPDF, page-aware), DOCX (python-docx), TXT/MD (utf-8) → `Page[]`; content-type + magic-byte detection; unknown → 415.
- `core/chunker.py` — normalize → sentence split (regex, no NLP deps) → greedy pack ~1200 chars with ~150 char overlap; never spans pages; page-attributed.
- `core/store.py` — JSON store: notebooks, sources (with `pages[]`, `chunks[]`), atomic writes, `RESEARCH_DATA_DIR` override, AND-term keyword search with snippet + score, chunk counts.
- `core/ingest.py` — bytes → parse → chunk → store; returns summary counts.
- `api/main.py` — notebooks CRUD, source upload (multipart, ≤50 MB), paste-text source, list/get/delete, chunks endpoint, `GET /api/notebooks/{id}/search?q=`.
- `frontend/src/` — `api.ts` fetch layer; NotebookPicker, UploadZone (multi-file + paste dialog), SourceList, SearchPanel; dark NotebookLM-ish shell.
- `backend/tests/` — chunker unit tests, parser tests (PDF/DOCX fixtures generated in-test), API round-trip (upload → list → search) against a temp data dir.

## M2 — search & information management (committed)

- `core/search.py` — query parser (`"phrases"` + terms, AND semantics) and relevance scoring (term frequency, phrase boost, proximity). New module; storage-agnostic.
- `store.search()` (rewritten) — now ranks via `core.search` and filters by `kind`, `source_ids`, `tags`, plus `limit`/`offset`.
- `api/search.py` — search endpoint takes `kind`, `source`, `tag`, `limit`, `offset`.
- `Source.tags` — tags on sources and summaries; `store.update_source()` + `PATCH /api/sources/{id}` to rename and/or retag (tags lowercased/deduped). Search can filter by tag.
- `core/fetcher.py` + `ingest.ingest_url` + `POST /api/notebooks/{id}/sources/url` — fetch a URL via httpx and extract main article text with trafilatura; source `kind == "url"`, original URL kept in `meta["url"]`.
- `core/export.py` + `GET /api/notebooks/{id}/export` — Obsidian-style markdown bundle as a zip: `index.md` linking each source, per-source `.md` with YAML frontmatter (title/kind/tags/url) and page text.
- Tests: search module, store-search filters, API filters, source update, URL ingest (fetch monkeypatched), export round-trip. `uv run pytest` green (40).

## Next milestones

- **M3** — AI mode plumbing: provider registry (`config.yaml`), free-key Settings API, embeddings (vector search joins chunk ids), cited streaming chat.
- **M4** — Deep Research: plan → keyless web search (ddgs/Wikipedia/arXiv; SearXNG optional) → gather → cited report, streamed; report export (md/pdf via Pandoc).
- **M5** — study tools: auto flashcards → Anki (genanki), quizzes (notebooklm-py style JSON), study guides, mind map (stretch).
- **M6** — polish + desktop packaging (Electron wrap of local server), model/provider switcher, OCR fallback (tesseract), Audio Overview stretch (local TTS).

## Parking lot

SQLite FTS5/sqlite-vec migration · chunk-level notes/annotations · source file-type passthrough (keep original bytes for re-parse) · spaced repetition scheduling · richer chunks/reader API (field search, per-source filters already in) · tag collections/folders.
