# HANDOFF.md

Live state of the project. **Read this first** before doing anything.

> Status: branch `main`, M0–M2 plus the native macOS alpha are committed. The
> working tree is green; backend tests pass (136) and the packaged macOS smoke
> test has passed on this Apple-silicon machine.

## Current state

- Branch `main`, remote `origin` = `https://github.com/fordaaaa/research`.
- **Owner direction (latest): macOS and keyless research first.** The native app
  must be a useful source-management and public-discovery tool without any key,
  account, or model. Keep the web UI focused; native integration should earn its
  complexity.
- Run it: `cd backend && uv run uvicorn api.main:app --reload` + `cd frontend && npm run dev` → http://localhost:5173
- Tests: `cd backend && uv run pytest` · Frontend check: `cd frontend && npm run build`

## Native macOS alpha

- `macos/Research.xcodeproj` is a real SwiftUI app (macOS 14+, arm64). It owns
  the child process and embeds the existing UI in `WKWebView`; Electron is not
  used.
- `backend/desktop.py` binds a random `127.0.0.1` port, serves the Vite build,
  and announces readiness to Swift. It keeps `/api` routes ahead of static files.
- `scripts/build_macos_app.sh` builds React, the PyInstaller `onedir` sidecar,
  and the Xcode app, copies the sidecar and web assets into Resources, then
  ad-hoc signs and verifies the bundle. Run it from the repository root.
- The shell writes to `~/Library/Application Support/research/data`; every
  launch has a random HttpOnly desktop-session cookie. Development remains
  unguarded when `RESEARCH_DESKTOP_TOKEN` is absent.
- The local build is not notarized or publicly distributable. Notarization
  requires Apple’s paid developer program and must remain optional under $0.

## Keyless discovery

- `/api/web/search` uses DDGS with moderate SafeSearch and no key or account.
  Its results can be added through the UI as URL sources and become local
  notebook data after ingest.
- The search panel has separate **Your sources** and **Search the web** modes;
  it does not silently send source searches to the internet.
- Keyless discovery, ingestion, search, reading, study workflows, and exports
  are the product direction. Do not make any of these rely on the optional AI
  adapter.
- An optional AI experiment exists (Gemini or OpenRouter provider, user picks in
  Settings) but is not a roadmap dependency. It stores a user-supplied key only
  locally and remains fully disabled otherwise. `core/providers.py` retries 429s
  (honoring `Retry-After`) and falls back to backup free models before erroring.

## Locked owner decisions

1. **$0 and keyless-first forever** — core workflows require no paid service, account, or API key.
2. **No local LLMs** (no Ollama) — optional remote AI is not a product dependency.
3. **No-AI mode is first-class** — ingest/search/web discovery/reader/exports work with no provider configured.
4. **Python backend (FastAPI + uv) + React frontend** — two languages accepted for best PDF/DOCX ecosystem.
5. **Commits: conventional prefixes, single line, no body, no Co-Authored-By.**
6. **SQLite deferred** — M1+ uses a JSON file store; revisit when embeddings (M3+) or scale demand it. Swap inside `core/store.py` only.

## Environment facts (this machine)

- MacBook Pro M1 Pro, 16 GB, macOS. `uv 0.12.1`, Python **3.12.13** (uv-managed; system python3 is 3.14 — do not use), Node 26, npm 11.
- npm installs can exceed 30s tool timeouts — use `npm install --maxsockets=25 --fetch-retries=1 --fetch-retry-maxtimeout=6000 --loglevel=error` and split installs. `setsid` does not exist on macOS; use `nohup` for background jobs.
- Long work sessions: owner wants `caffeinate -dimsu` running (`nohup caffeinate -dimsu &`, `pkill caffeinate` when done).
- Backend deps installed: pymupdf, python-docx, python-multipart, trafilatura, httpx, pyinstaller.

## Stack versions

FastAPI + pydantic v2 (backend, `uv.lock` pinned) · React 19 + Vite 8.2.2 + Tailwind 4.3.3 + TypeScript (frontend) · storage: JSON files under `backend/data/` (gitignored). Note newer fix commits: streamed uploads (50 MB cap mid-stream), path-id validation via `api/deps.safe_id`, generic 500 handler, capped query/paste lengths.

## Backend map (current)

- `api/main.py` — FastAPI factory; lifespan sets `app.state.store`; global exception handler returns generic 500 (no stack leak); can mount built web assets for the desktop sidecar.
- `desktop.py` — ephemeral loopback Uvicorn entrypoint for the native app.
- `api/deps.py` — `safe_id()` (regex `^[a-f0-9]{12}$`, rejects path traversal), `get_store(app)`, `notebook_or_404()`.
- `api/notebooks.py` — `POST/GET /api/notebooks`, `DELETE /api/notebooks/{id}`, `GET /api/notebooks/{id}/export` (Obsidian-style markdown zip).
- `api/sources.py` — upload (multipart, ≤50 MB streamed cap, ≤20 files, per-file errors), paste (`/sources/text`), URL (`/sources/url`), list, get, chunks (offset/limit), `PATCH /api/sources/{id}` (rename + tags), delete.
- `api/outlines.py` — persistent deep-research outlines per notebook: CRUD, `POST /outlines/draft` (heuristic angles + optional AI items/fields), `POST /outlines/{id}/deep` (per-item web pass, never ingests), `POST /outlines/{id}/report` (outline-structured digest or AI report saved as a source).
- `api/humanize.py` — `POST /api/humanize/analyze` (keyless pattern flags, no notebook needed), `POST /api/humanize/rewrite` (optional AI rewrite with voice sample; 503 without a key).
- `api/skills.py` — global skills library CRUD (`/api/skills`) + per-notebook memory notes (`GET/PUT /api/notebooks/{id}/memory`). Matched skills + memory are appended to chat/synthesis/report prompts only when AI is configured.
- `api/demo.py` — `POST /api/demo` builds a "Cell biology demo" notebook (3 original study sources + outline + memory) so new users can try everything with one click.
- `api/study.py` — keyless study tools: flashcard CRUD (`/cards`), Anki-ready TSV export, one-page study guide (`GET/POST /guide`, saveable as a source), mind map tree + markdown export (`/mindmap`).
- `api/search.py` — `GET /api/notebooks/{id}/search?q=&kind=&source=&tag=&limit=&offset=`; delegates to `store.search(...)`.
- `core/models.py` — pydantic: `Page`, `Chunk`, `Source` (`tags`, `meta`), `SourceSummary`, `Notebook`, `SearchHit`, `NotebookCreate`, `PasteCreate`, `SourceUpdate`, `UrlCreate`. `SourceKind` includes `"url"`.
- `core/parsers.py` — magic-byte + ext + content-type detection; PDF→pages via PyMuPDF, DOCX via python-docx (single page), txt/md utf-8. Unknown → 415 (`IngestError`).
- `core/chunker.py` — normalize → sentence split → greedy ~1200-char chunks, ~150 overlap, **never spans pages**.
- `core/search.py` — query parsing + relevance (see ⚠️ Uncommitted section — read working tree, not commit).
- `core/deepresearch.py` — outline draft/parse helpers, per-item query builder, outline-structured report digest + prompt.
- `core/humanize.py` — 13 deterministic AI-writing pattern checks + rewrite prompt builder (all keyless; rewrite itself needs a provider).
- `core/skills.py` — trigger matching (substring, cap 3) + prompt-section builders for skills and memory.
- `core/study.py` — term-frequency key terms, markdown study-guide builder, mind-map tree + markdown serializers (all keyless).
- `core/websearch.py` — keyless DDGS public-web discovery.
- `core/settings.py` — local optional-key storage; provider-aware (`gemini` | `openrouter`), legacy files without provider default to gemini.
- `core/gemini.py` / `core/openrouter.py` — provider REST clients; errors carry `status` + `retry_after`.
- `core/providers.py` — dispatch `generate(provider, key, model, prompt) -> (answer, model)`; retry on 429/5xx, skip to backup models on 404/400, abort on 401/403; `FALLBACK_MODELS`/`DEFAULT_MODELS` constants live here.
- `core/store.py` — JSON store: notebooks index, per-source files with `pages[]`/`chunks[]`; atomic writes; in-memory `_by_id`/`_source_index`; `RESEARCH_DATA_DIR` override; `search()` (keyword AND, phrase, filters).
- `core/ingest.py` — `ingest_bytes` (files), `ingest_text` (paste), `ingest_url` (calls `fetcher`).
- `core/fetcher.py` — httpx GET + trafilatura article extraction; `FetchError` → mapped to HTTP status.
- `core/export.py` — notebook → `index.md` + per-source `.md` with YAML frontmatter, zipped.

## Frontend map (minimal, intentionally lagging)

`src/api.ts` (only fetch layer) · `src/components/` — NotebookPicker (home dashboard + demo entry), UploadZone, SourceList (tap-to-read), ReaderModal (page navigation), SearchPanel, ResearchPanel (quick plan/gather), OutlinePanel (deep-research outlines), ChatPanel, StudyPanel (flashcards + practice + guide + mind map), HumanizerPanel, SkillsPanel, SettingsDialog, `ui.tsx` (Button/Card/Badge/Tabs/inputs) · `App.tsx` — sticky header + sidebar (sources + notebook export) + tabbed workspace (Research/Deep/Ask/Search/Study/Humanize/Skills). Dark neutral theme. No router, no state library. Web-first: the macOS WKWebView wrapper inherits this UI, so native work stays in the shell.

## Testing

- `backend/tests/` — `conftest.py` sets `RESEARCH_DATA_DIR` to a temp dir per test and exposes a `client` fixture. Coverage: parsers, chunker, search, store-search, API, fetcher, export.
- `showcase/` (gitignored) — panoply-showcase-skill workflow: scripted Chromium beat run (9/9 passing, 0 console errors) + Remotion edit → `out/research-showcase.mp4` (49.5s, H.264/yuv420p). See `showcase/README.md` to re-run.
- Build checks: `cd backend && uv run pytest`; `cd frontend && npm run build`; then `sh scripts/build_macos_app.sh` for the arm64 app bundle and sidecar smoke test.

## Next milestones

- **M3** — native app polish: icon, native export/download handoff, streamed chat, automated Xcode tests, and distribution investigation without paid defaults.
- **M5 — SHIPPED (student-ready v1):** flashcards with practice mode + Anki TSV export, keyless one-page study guides (saveable as sources), keyless mind maps (collapsible UI + markdown export), in-app source reader, one-click demo notebook, notebook zip export in the sidebar.
- **M4 polish** — possible follow-ups: persist research plans per notebook, cap bulk-add selections, retry failed adds.

## Keyless research mode (M4, shipped)

- Staged, frontend-driven pipeline — no background jobs. `POST /api/notebooks/{id}/research/plan|gather|synthesize` in `api/research.py`; algorithm in `core/research.py` (5-template heuristic planner with optional AI planner and line-based parse + heuristic fallback; URL-normalized cross-query ranking `3×queries + max(0,4−pos) + min(5,overlap)`, ≤2/domain, cap 15; digest builder). Shared cited-context helper lives in `core/context.py` (extracted from api/ai.py; used by chat and synthesis).
- Gather never ingests: the UI bulk-adds through the existing per-URL `/sources/url`. Failed queries degrade individually (0.35s `QUERY_DELAY`); 503 only when all fail. Synthesize falls back to the keyless digest on any AI error and records `{research_topic, queries, origin}` in source meta via `ingest_text(extra_meta=...)`.
- Frontend: `ResearchPanel.tsx` state machine (topic → editable query chips → ranked checklist with top-5 preselect → per-URL add progress → optional overview), wired into App.tsx between ChatPanel and SearchPanel.
- **Deep-research outlines (Deep-Research-skills-inspired, shipped):** persistent per-notebook outlines (`outlines.json`) with editable items + fields, human-in-the-loop at every stage (draft → edit → per-item deep pass → bulk add → outline-structured report). Heuristic draft reuses the 5 plan angles + 4 default fields; AI draft upgrades to concrete items/fields when configured. Same keyless guarantees as quick research (never ingests during deep pass, digest fallback, 503 only on total failure). UI: `OutlinePanel.tsx` under the Deep research tab.
- **Humanizer (humanizer-skill-inspired, shipped):** `core/humanize.py` implements 13 of the 25 public patterns as deterministic regex checks (staging, AI vocab, inflation, formatting, chat residue, rhythm). `POST /api/humanize/analyze` is keyless and notebook-free; `POST /api/humanize/rewrite` needs a configured key and accepts an optional voice sample. UI: `HumanizerPanel.tsx` under the Humanize tab.
- **Skills + memory (hermes-agent-inspired, shipped keyless subset):** global skills library (`data/skills.json`, trigger-word matching, cap 3) and per-notebook memory notes. Both are local JSON, work with no key, and only reach a provider as prompt sections in chat/synthesis/report when AI is configured. Deliberately NOT vendored: Hermes gateway, messaging platforms, cron, subagents, TUI — all require keys/servers and would break keyless-first. UI: `SkillsPanel.tsx` under the Skills tab.
- **M5 — shipped**, see Next milestones (study kit: flashcards, guides, mind maps, reader, demo).
- **M6** — only then assess optional remote AI experiments; they must never gate the product.

## Parking lot

SQLite FTS5/sqlite-vec migration · chunk-level notes/annotations · source file-type passthrough (keep original bytes for re-parse) · field search (e.g. `title:`) · tag collections/folders · reader API (highlighted page text) · spaced repetition scheduling.
