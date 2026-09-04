# HANDOFF.md

Live state of the project. **Read this first** before doing anything.

> Status: branch `main`, M0–M2 committed & pushed (HEAD `b7ac425`), **plus uncommitted in-progress search work in the working tree that is currently RED (11 failing tests).** See "⚠️ Uncommitted work — finish me" before running tests or building anything.

## Current state

- Branch `main`, remote `origin` = `https://github.com/fordaaaa/research`. HEAD `b7ac425 docs: update handoff for m2`, pushed and clean **up to that commit**.
- **Owner direction (latest): capability-first.** Prioritize searching and information management; UI work is deferred — the existing minimal UI stays as-is and may lag behind the API. End goal unchanged: a real app (desktop packaging later). Frontend is intentionally secondary right now.
- Run it: `cd backend && uv run uvicorn api.main:app --reload` + `cd frontend && npm run dev` → http://localhost:5173
- Tests: `cd backend && uv run pytest` · Frontend check: `cd frontend && npm run build`

## ⚠️ Uncommitted work — finish me

The working tree has a **large, deliberate search-quality upgrade that is NOT committed and is currently breaking the build** (`backend/core/search.py` and `backend/tests/test_search.py` are modified; `git status` shows both as `M`). It was intentionally left in-progress. Do not assume the committed M2 `core/search.py` is current — read the working tree.

**What the working-tree `core/search.py` adds (already written, unit-testable):**
1. `STOPWORDS` — short English stopword set, dropped from query terms.
2. `stem(word)` — a light Porter-style suffix stripper (hand-rolled, no deps) so morphology variants collapse (`mitochondria`/`mitochondrial`/`mitochondrion` → `mitochondri`).
3. IDF weighting — `score_chunk()` gained `df: dict[str,int] | None` and `n_docs: int` params; `_tfidf()` does smoothed IDF `tf * log(1 + N/df)`, falling back to raw tf when `df` is falsy (backwards compatible).
4. `score_chunk()` now returns a **3-tuple** `(matched, score, matched_term_stems)` — the extra stems list is for snippet/term highlighting.
5. `ParsedQuery` now carries `original_terms` (unstemmed, for display) alongside stemmed `terms` and verbatim `phrases`.

**Why it's red:** `core/store.py` was NOT updated to match the new contract. The committed caller still does `matched, score = score_chunk(chunk.text, parsed)` (store.py ~line 217), which fails against the 3-tuple, and `store.search()` never computes `df`/`n_docs` so IDF never actually engages. ~11 tests that exercise store/API search fail.

**Completion tasks for the next agent (get green, then commit):**
1. Update `store.search()`:
   - Precompute per-notebook `df` (stemmed term → how many sources contain it) and `n_docs` (source count) before the hit loop. Since chunks are stored per source and search scans on demand, compute `df` by scanning each source's chunks once (stem each word via the public `stem()`), or accept a first-scan cost.
   - Unpack the 3-tuple: `matched, score, matched_stems = score_chunk(chunk.text, parsed, df=df, n_docs=n_docs)`.
   - Pass `df`/`n_docs` only when you intend IDF; passing `None` keeps old raw-tf behavior.
2. Decide the shapes: if highlighting lands, `SearchHit` (core/models.py) likely needs the matched stems (or an `original_terms` echo) so the API/UI can bold terms; update `api/search.py` only if the shape changes.
3. Keep the existing `score_chunk` unit tests green and add store-level tests asserting IDF changes ranking (`test_idf_*` already exist in `tests/test_search.py`). `test_score_chunk_returns_matched_stems` asserts the 3-tuple stems.
4. Run `cd backend && uv run pytest` until fully green (>35 passing), then commit as `feat:` (e.g. `feat: add stemming and idf to search`). Split into logical commits if preferred (search module first, then store wiring).

**Don't** revert the search upgrade to get green — it's wanted work. Note `_log()` hand-rolls ln() for speed (no `math` import); fine to keep or swap for `math.log`.

## Locked owner decisions

1. **$0 forever** — no paid services; pluggable providers, all default off.
2. **No local LLMs** (no Ollama) — AI comes from optional free-tier API keys (Groq / Google AI Studio / OpenRouter) pasted into Settings, M3+.
3. **No-AI mode is first-class** — ingest/search/reader/exports work with `ai.enabled: false`.
4. **Python backend (FastAPI + uv) + React frontend** — two languages accepted for best PDF/DOCX ecosystem.
5. **Commits: conventional prefixes, single line, no body, no Co-Authored-By.**
6. **SQLite deferred** — M1+ uses a JSON file store; revisit when embeddings (M3+) or scale demand it. Swap inside `core/store.py` only.

## Environment facts (this machine)

- MacBook Pro M1 Pro, 16 GB, macOS. `uv 0.12.1`, Python **3.12.13** (uv-managed; system python3 is 3.14 — do not use), Node 26, npm 11.
- npm installs can exceed 30s tool timeouts — use `npm install --maxsockets=25 --fetch-retries=1 --fetch-retry-maxtimeout=6000 --loglevel=error` and split installs. `setsid` does not exist on macOS; use `nohup` for background jobs.
- Long work sessions: owner wants `caffeinate -dimsu` running (`nohup caffeinate -dimsu &`, `pkill caffeinate` when done).
- Backend deps installed: pymupdf, python-docx, python-multipart, trafilatura, httpx.

## Stack versions

FastAPI + pydantic v2 (backend, `uv.lock` pinned) · React 19 + Vite 8.2.2 + Tailwind 4.3.3 + TypeScript (frontend) · storage: JSON files under `backend/data/` (gitignored). Note newer fix commits: streamed uploads (50 MB cap mid-stream), path-id validation via `api/deps.safe_id`, generic 500 handler, capped query/paste lengths.

## Backend map (current)

- `api/main.py` — FastAPI factory; lifespan sets `app.state.store`; global exception handler returns generic 500 (no stack leak); mounts `notebooks.register(app)`, `sources.register(app)`, `search.register(app)`.
- `api/deps.py` — `safe_id()` (regex `^[a-f0-9]{12}$`, rejects path traversal), `get_store(app)`, `notebook_or_404()`.
- `api/notebooks.py` — `POST/GET /api/notebooks`, `DELETE /api/notebooks/{id}`, `GET /api/notebooks/{id}/export` (Obsidian-style markdown zip).
- `api/sources.py` — upload (multipart, ≤50 MB streamed cap, ≤20 files, per-file errors), paste (`/sources/text`), URL (`/sources/url`), list, get, chunks (offset/limit), `PATCH /api/sources/{id}` (rename + tags), delete.
- `api/search.py` — `GET /api/notebooks/{id}/search?q=&kind=&source=&tag=&limit=&offset=`; delegates to `store.search(...)`.
- `core/models.py` — pydantic: `Page`, `Chunk`, `Source` (`tags`, `meta`), `SourceSummary`, `Notebook`, `SearchHit`, `NotebookCreate`, `PasteCreate`, `SourceUpdate`, `UrlCreate`. `SourceKind` includes `"url"`.
- `core/parsers.py` — magic-byte + ext + content-type detection; PDF→pages via PyMuPDF, DOCX via python-docx (single page), txt/md utf-8. Unknown → 415 (`IngestError`).
- `core/chunker.py` — normalize → sentence split → greedy ~1200-char chunks, ~150 overlap, **never spans pages**.
- `core/search.py` — query parsing + relevance (see ⚠️ Uncommitted section — read working tree, not commit).
- `core/store.py` — JSON store: notebooks index, per-source files with `pages[]`/`chunks[]`; atomic writes; in-memory `_by_id`/`_source_index`; `RESEARCH_DATA_DIR` override; `search()` (keyword AND, phrase, filters).
- `core/ingest.py` — `ingest_bytes` (files), `ingest_text` (paste), `ingest_url` (calls `fetcher`).
- `core/fetcher.py` — httpx GET + trafilatura article extraction; `FetchError` → mapped to HTTP status.
- `core/export.py` — notebook → `index.md` + per-source `.md` with YAML frontmatter, zipped.

## Frontend map (minimal, intentionally lagging)

`src/api.ts` (only fetch layer) · `src/components/` — NotebookPicker, UploadZone, SourceList, SearchPanel · `App.tsx` routes picker vs notebook view. Dark neutral theme. No router, no state library.

## Testing

- `backend/tests/` — `conftest.py` sets `RESEARCH_DATA_DIR` to a temp dir per test and exposes a `client` fixture. Coverage: parsers, chunker, search, store-search, API, fetcher, export.
- **Remote `origin/main` is at `b7ac425`** — if you finish the search wiring and commit, you'll fast-forward push cleanly (no other committers). `git fetch` first to confirm.

## Next milestones

- **M3** — AI mode plumbing: provider registry (`config.yaml`), free-key settings, embeddings/vector search (joins chunk ids; revisit SQLite then), cited streaming chat.
- **M4** — Deep Research: plan → keyless web search (ddgs/Wikipedia/arXiv; SearXNG optional) → gather → cited report, streamed; report export (md/pdf via Pandoc).
- **M5** — study tools: auto flashcards → Anki (genanki), quizzes (notebooklm-py style JSON), study guides, mind map (stretch).
- **M6** — polish + desktop packaging (Electron wrap of local server), model/provider switcher, OCR fallback (tesseract), Audio Overview stretch (local TTS).

## Parking lot

SQLite FTS5/sqlite-vec migration · chunk-level notes/annotations · source file-type passthrough (keep original bytes for re-parse) · field search (e.g. `title:`) · tag collections/folders · reader API (highlighted page text) · spaced repetition scheduling.
