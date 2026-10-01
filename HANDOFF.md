# HANDOFF.md

Live state of the project. **Read this first** before doing anything.

> Status: branch `main`, hosted multi-user pivot landed (SQLite + email auth,
> per-user data). Web and macOS polish plus Gemini model maintenance are the
> current work. Windows is deferred; mobile lives in `research-mobile`.
> Owner direction: hosted backend (`research-server`) with thin clients, App
> Store later ($99 program budgeted then, not now). Login order: email (done)
> → Google (implemented, client-ID config pending) → Apple last.
> Owner vision (2026-09-29): Notion for students — academic tailoring plus a
> near-addictive sound/motion feel; see Next milestones.
> Shipped:
> `5e40a21 fix: authenticate notebook exports` (notebook .zip via Bearer
> fetch, server filename preserved, token kept out of the URL) and
> `5eef8ac fix: authenticate study exports` (cards TSV + mindmap exports,
> same guarantees). Both carry frontend tests (`api.export.test.ts`,
> `api.study-export.test.ts`); 401s clear the token and signal login.

## Study/mobile batch shipped (2026-09-20)

- Flashcards v2 adds safe legacy SQLite migration, due-card queues, persisted
  again/hard/good/easy scheduling, editing, tags/filtering, source-grounded
  draft suggestions, and mobile swipe grading with accessible button/keyboard
  alternatives. Suggestions are deterministic, keyless, and save only after a
  user action.
- Keyless glossary and quiz endpoints/UI derive stable, source-cited entries
  and questions from notebook chunks. Glossary entries can open their source,
  be copied, or become a flashcard; quiz scoring stays in the UI session.
- Playwright now tests the app itself on iPhone/WebKit and Pixel/Chromium. Local
  runs start isolated FastAPI/Vite servers; remote runs use
  `RESEARCH_E2E_BASE_URL` and gate stateful tests behind explicit credentials or
  `RESEARCH_E2E_ALLOW_REGISTRATION=1`.
- Historical verification at that milestone: backend `195 passed`; frontend
  `93 passed`; production build, six local mobile E2E tests, and the signed
  arm64 app build passed.

## Web and macOS polish (2026-09-23)

- Thinking orbs use contrasting ink on deep-sea primary buttons. The web app
  and macOS shell share this frontend. The separate `research-mobile` app has
  its own `expo-thinking-orbs` integration and spinner fallback.
- The macOS shell uses a native save panel for WebKit downloads, has startup
  timeout/crash handling, an app icon, and an Xcode unit-test target. Local
  builds remain ad-hoc signed; notarization is not required.
- New Gemini settings use `gemini-3.5-flash-lite`; fallback models are
  `gemini-3.5-flash-lite` and `gemini-3.1-flash-lite`. Saved user model choices
  remain unchanged. Session chat now includes matching saved skills.
- Verification for this batch: backend `214 passed`; frontend `107 passed`,
  build clean, lint warnings only, mobile browser E2E `6 passed`, Xcode unit
  tests pass, and `sh scripts/build_macos_app.sh` builds/signs the arm64 app.

## Notaeo, sounds, and auth hardening (2026-09-24 → 2026-09-27)

- **Notaeo rebrand + workspace remake** (`d6da355`, `a95ee63`, `dcdb327`,
  `4e7db2e`): the product name is Notaeo; workspace UI, sign-in, and student
  themes/typography redesigned. Source-to-essay workflow documented
  (`e604113`). macOS polish + first-run tour: `eb2d695`, `05e1a8d`.
- **Notes module** (`api/notes.py`): notebook markdown notes CRUD with
  validated source/chunk citations and optimistic concurrency — the seed of
  the Notion-style editor direction.
- **Cited passages + ingest/search upgrades**: the reader lifts cited
  passages (`core/keypassages.py`, `9ab49ed`); XHTML article ingest
  (`core/article.py`, `35a2b1d`); search ranks closer terms higher
  (`dd624a1`) and falls back to grouped prefix matches for single-token
  queries (`a3aa3a4`).
- **Onboarding progress**: `user_progress` table + `GET /api/me/progress`
  (`mark_progress` fires from add-source/search/export/review flows);
  `FolioLoader.tsx` staged boot animation; 4-item `Checklist.tsx` fed by
  server-or-local flags and playing `playSuccess` on completion.
  `GET /api/runtime` (`core/local_runtime.py`) advertises privacy-boundary
  facts.
- **Sound + press physics, default on** (`0510da2`, `25212d2`, `66cc326`):
  `src/sound.ts` synthesizes everything offline over one shared
  lazily-unlocked AudioContext — boot lift, success confirm, quiet tap tick,
  and a settings preview that deliberately bypasses the mute gate.
  `armTapSounds()` is one delegated document-level listener wired in
  `main.tsx`; `index.css` adds universal `:active` press physics
  (`scale(0.96)` + brightness) with `prefers-reduced-motion` collapse. One
  toggle in SettingsDialog (`notaeo:sound`); design doc
  `frontend/docs/LOADING_SOUND.md`.
- **Auth hardening** (`c42af08`): three-layer login rate limiting (verify-first
  per-key 10/5min, per-IP 60/5min, per-email 50/5min), 20/hour/IP register
  throttle, `purge_expired_sessions()`, uniform-404 cross-user oracle
  (sweep-tested), XFF ignored unless `RESEARCH_TRUST_XFF=1`.
- **Google OAuth implemented** (postdates the last test-count citation):
  `core/google_auth.py` id_token verification, `POST /api/auth/google` +
  status route, frontend wiring in `api.ts`. Configuration with a real client
  ID still pending.
- **Duplicate-source warning** (`8e9d02f`): ingest precheck returns
  `DuplicateRef`; add paths accept `force` to proceed. Duplicate register
  answers `200 {registered: false}` (anti-enumeration), not 409.
- Confirm deletes + dialog focus traps (`a162c84`), study-builder cleanup
  (`bf7f53a`).
- Hosted note: `research-server`'s backend snapshot was synced through this
  range (2026-09-29); the private overlay needed a `/api/ai/hosted/status`
  route-precedence fix and its tests adopted the new duplicate-register
  contract.

## Dashboard + calendar + Classroom batch (2026-09-30)

- **Home dashboard** replaces the file-picker-first home: greeting + due-card
  count + study streak (new `user_activity_days` table fed by review/source/
  note routes; math in `core/dashboard.py`), a 35-day month calendar
  (`CalendarMonth.tsx`, no deps) with class-colored assignment dots + card-due
  dots, classes/assignments CRUD (`api/classes.py`, user-scoped, notebook-
  linkable), recent notes/sources, and the notebook library as a section
  (`NotebookPicker variant="library"`: no hero/footer/main landmark).
- **Cross-notebook review**: `GET /api/me/review-queue` + `POST
  /api/me/cards/{id}/review` grade across every notebook; ReviewSession takes
  optional `gradeCard`/`notebookNames`; App hosts the queue in a dialog and
  bumps the dashboard on exit.
- **Google Classroom** (`api/classroom.py` + `core/classroom.py`): consent
  URL as JSON (browser hops can't carry the bearer), stateless HMAC state
  (`digest.user_id`), token exchange/refresh into a new `google_tokens` table,
  idempotent coursework sync into classes/assignments (`source=
  'google_classroom'`, keyed by external_id). Activates with
  `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET` + `RESEARCH_PUBLIC_BASE_URL`
  and test-user access to the two classroom.readonly scopes.
- Verification: backend `295 passed`; frontend `500 passed` (218 files);
  `npm run build` clean. Note: the full frontend suite flakes ~1 random
  timer/announcement App test per run under local parallel load (passes in
  isolation; clean tree passed once) — worth watching in CI.

## Current state

- Branch `main`, remote `origin` = `https://github.com/fordaaaa/research`.
- **FX polish (2026-10-01):** WebAudio tones now fade in and out smoothly;
  saves/exports use a short rising pair, and finished review sessions use a
  quieter four-note rise. Review cards animate into place, the completion
  panel gets a brief glow, the upload dropzone responds while dragging, and
  calendar day changes and assignment checks get short transitions. The
  existing reduced-motion rule collapses these effects. This uses the current
  CSS/WebAudio stack with no added dependency.
- **Code organization (2026-10-01):** `frontend/src/api.ts` remains the stable
  import barrel over domain modules in `frontend/src/api/`, with contracts
  grouped under `frontend/src/api/types/`. Backend tests are grouped under
  `backend/tests/` by feature; the shared `conftest.py` stays at the root.
- **Owner direction (latest): hosted multi-user backend first.** Accounts are
  required on every data route; AI keys stay optional and per-user. License is
  MIT (matches fordaaaa/panoply). Google OAuth implemented (client-ID config
  pending); Apple at App Store time.
- Run it: `cd backend && uv run uvicorn api.main:app --reload --no-proxy-headers` + `cd frontend && npm run dev` → http://localhost:5173 (register a local account — free, instant)
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

1. **Accounts required, AI optional** — login (email + Google done, Apple at App Store time) gates every data route; AI keys stay optional and per-user. Self-hosting stays $0.
2. **No local LLMs** (no Ollama) — optional remote AI is not a product dependency.
3. **No-AI mode is first-class** — ingest/search/web discovery/reader/exports work with no provider configured.
4. **Python backend (FastAPI + uv) + React frontend** — two languages accepted for best PDF/DOCX ecosystem.
5. **Commits: conventional prefixes, single line, no body, no Co-Authored-By.**
6. **SQLite store** — multi-user data lives in `app.db` (WAL) under the data dir; per-user rows everywhere, cross-user access is 404. Swap inside `core/store.py` only. One-shot JSON import: `backend/scripts/migrate_json_to_sqlite.py`.
7. **Public/private boundary (locked)** — this repo stays MIT and holds the complete useful keyless/no-AI local/self-hosted product (ingest, search, reader, study, exports, discovery, shared UI, local service, BYOK adapters). Private `fordaaaa/research-server` owns hosted operations only: cloud accounts, managed storage/sync, subscriptions/entitlements, hosted AI credits/routing, rate limits/abuse controls, admin/ops, production secrets/infra. Never imply access to private code or gate local flows on it.
8. **Three AI modes (locked)** — no-AI first-class, BYOK (per-user Gemini/OpenRouter key), hosted credits later (limited free allowance + paid tiers, routed/entitled by the private server).
9. **Platforms (owner update 2026-09-23)** — macOS and web now; Windows deferred. iOS and Android live in the separate `research-mobile` repository.
10. **Hosted-launch legal (locked, owner + lawyer required)** — launch needs Terms of Service, Privacy Policy, Acceptable Use/AI terms, subscription/cancellation language, retention/export/deletion commitments, copyright/takedown handling, and student/minor-data treatment. Legal review is required; docs must not draft definitive legal claims.
11. **Coding-worker policy (locked)** — every future coding worker writes a meaningful failing test first, implements, runs targeted tests, runs the repo-required broader checks, reports exact evidence, and commits only after reviewer approval.

## Environment facts (this machine)

- MacBook Pro M1 Pro, 16 GB, macOS. `uv 0.12.1`, Python **3.12.13** (uv-managed; system python3 is 3.14 — do not use), Node 26, npm 11.
- npm installs can exceed 30s tool timeouts — use `npm install --maxsockets=25 --fetch-retries=1 --fetch-retry-maxtimeout=6000 --loglevel=error` and split installs. `setsid` does not exist on macOS; use `nohup` for background jobs.
- Long work sessions: owner wants `caffeinate -dimsu` running (`nohup caffeinate -dimsu &`, `pkill caffeinate` when done).
- Backend deps installed: pymupdf, python-docx, python-multipart, trafilatura, httpx, pyinstaller.

## Stack versions

FastAPI + pydantic v2 (backend, `uv.lock` pinned) · React 19 + Vite 8.2.2 + Tailwind 4.3.3 + TypeScript (frontend) · storage: SQLite `app.db` under the data dir (gitignored). Note newer fix commits: streamed uploads (50 MB cap mid-stream), path-id validation via `api/deps.safe_id`, generic 500 handler, capped query/paste lengths.

## Backend map (current)

- `api/main.py` — FastAPI factory; lifespan sets `app.state.store`; global exception handler returns generic 500 (no stack leak); can mount built web assets for the desktop sidecar.
- `desktop.py` — ephemeral loopback Uvicorn entrypoint for the native app.
- `api/deps.py` — `safe_id()` (regex `^[a-f0-9]{12}$`), `get_store(app)`, `notebook_or_404(store, user_id, ...)` (ownership-checked), `get_current_user()` (Bearer → 401).
- `api/auth.py` — `POST /api/auth/register|login` (pbkdf2, 30-day sessions; register answers duplicates `200 {registered: false}` — anti-enumeration), `POST /api/auth/logout`, `GET /api/auth/me`, `POST /api/auth/google` + `GET /api/auth/google/status` (id_token verification via `core/google_auth.py`, 503 unconfigured), `GET /api/me/progress` (onboarding flags). Login is rate-limited in three layers (verify-first per-key 10/5min, per-IP 60/5min, per-email 50/5min) plus a 20/hour/IP register throttle; XFF is ignored unless `RESEARCH_TRUST_XFF=1`.
- `api/notebooks.py` — `POST/GET /api/notebooks`, `GET /api/notebooks/{id}` (detail), `DELETE /api/notebooks/{id}`, `GET /api/notebooks/{id}/export` (Obsidian-style markdown zip).
- `api/sources.py` — upload (multipart, ≤50 MB streamed cap, ≤20 files, per-file errors), paste (`/sources/text`), URL (`/sources/url`), list, get, chunks (offset/limit), `PATCH /api/sources/{id}` (rename + tags), delete.
- `api/outlines.py` — persistent deep-research outlines per notebook: CRUD, `POST /outlines/draft` (heuristic angles + optional AI items/fields), `POST /outlines/{id}/deep` (per-item web pass, never ingests), `POST /outlines/{id}/report` (outline-structured digest or AI report saved as a source).
- `api/humanize.py` — `POST /api/humanize/analyze` (keyless pattern flags, no notebook needed), `POST /api/humanize/rewrite` (optional AI rewrite with voice sample; 503 without a key).
- `api/skills.py` — per-user skills library CRUD (`/api/skills`) + per-notebook memory notes (`GET/PUT /api/notebooks/{id}/memory`). Matched skills + memory are appended to chat/synthesis/report prompts only when AI is configured.
- `api/demo.py` — `POST /api/demo` builds a "Cell biology demo" notebook (3 original study sources + outline + memory) so new users can try everything with one click.
- `api/study.py` — keyless study tools: flashcard CRUD, persisted review scheduling and due queues, source-grounded card suggestions, glossary, quiz, Anki-ready TSV export, one-page study guide (`GET/POST /guide`, saveable as a source), and mind map tree + markdown export (`/mindmap`).
- `api/search.py` — `GET /api/notebooks/{id}/search?q=&kind=&source=&tag=&limit=&offset=`; delegates to `store.search(...)`.
- `api/ai.py` — optional BYOK chat: provider settings (`GET/PUT/DELETE /api/settings/ai`), chat session CRUD + messages, `POST .../chat`; `GET /api/ai/hosted/status` honestly answers `{enabled: false}` locally (the private hosted server overrides this route).
- `api/notes.py` — notebook markdown notes CRUD with validated source/chunk citations and optimistic concurrency.
- `core/models.py` — pydantic: `Page`, `Chunk`, `Source` (`tags`, `meta`), `SourceSummary`, `Notebook`, `SearchHit`, `NotebookCreate`, `PasteCreate`, `SourceUpdate`, `UrlCreate`. `SourceKind` includes `"url"`.
- `core/parsers.py` — magic-byte + ext + content-type detection; PDF→pages via PyMuPDF, DOCX via python-docx (single page), txt/md utf-8. Unknown → 415 (`IngestError`).
- `core/chunker.py` — normalize → sentence split → greedy ~1200-char chunks, ~150 overlap, **never spans pages**.
- `core/search.py` — query parsing + relevance: keyword AND, phrase, filters; closer-term ranking and grouped prefix fallback for single-token queries.
- `core/deepresearch.py` — outline draft/parse helpers, per-item query builder, outline-structured report digest + prompt.
- `core/humanize.py` — 13 deterministic AI-writing pattern checks + rewrite prompt builder (all keyless; rewrite itself needs a provider).
- `core/skills.py` — trigger matching (substring, cap 3) + prompt-section builders for skills and memory.
- `core/study.py` — term-frequency key terms, markdown study-guide builder, mind-map tree + markdown serializers (all keyless).
- `core/websearch.py` — keyless DDGS public-web discovery.
- `core/gemini.py` / `core/openrouter.py` — provider REST clients; errors carry `status` + `retry_after`.
- `core/providers.py` — dispatch `generate(provider, key, model, prompt) -> (answer, model)`; retry on 429/5xx, skip to backup models on 404/400, abort on 401/403; `FALLBACK_MODELS`/`DEFAULT_MODELS` constants live here.
- `core/store.py` — SQLite store (`app.db`, WAL): users (pbkdf2), sessions (hashed tokens, 30d, `purge_expired_sessions()`), per-user notebooks/sources/outlines/cards/notes/skills/memory/chat sessions/AI settings/`user_progress` (`mark_progress`/`get_progress`); `RESEARCH_DATA_DIR` override; `search()` (keyword AND, phrase, filters).
- `core/ingest.py` — `ingest_bytes` (files), `ingest_text` (paste), `ingest_url` (calls `fetcher`).
- `core/fetcher.py` — httpx GET + trafilatura article extraction; `FetchError` → mapped to HTTP status.
- `core/article.py` — XHTML article extraction for ingest.
- `core/keypassages.py` — deterministic passage ranking behind reader cited passages.
- `core/local_runtime.py` — privacy-boundary facts served by `GET /api/runtime` (desktop/server mode, loopback-only, explicit egress list).
- `core/google_auth.py` — Google id_token verification for OAuth sign-in; 503 when unconfigured.
- `core/export.py` — notebook → `index.md` + per-source `.md` with YAML frontmatter, zipped.

## Frontend map (minimal, intentionally lagging)

`src/api.ts` is the compatibility barrel for domain modules in `src/api/`; `src/api/client.ts` owns token handling, shared response parsing, and downloads, with contracts grouped under `src/api/types/`. `src/components/` — AuthPanel (login/register gate), NotebookPicker (home dashboard + demo entry), UploadZone, SourceList (tap-to-read), ReaderModal (page navigation), SearchPanel, ResearchPanel (quick plan/gather), OutlinePanel (deep-research outlines), ChatPanel, StudyPanel (scheduled flashcards + grounded drafts + glossary + quiz + guide + mind map), HumanizerPanel, SkillsPanel, SettingsDialog, `ui.tsx` (Button/Card/Badge/Tabs/inputs) · `App.tsx` — sticky header, desktop tool rail/source panel, and responsive mobile navigation. Appearance is local to the device: Paper (default), Ocean, Night, with readable Atkinson Hyperlegible Next or optional Maple Mono; both fonts are bundled offline. `src/index.css` maps existing `neutral-*` utilities to theme tokens (`neutral-950` page, `neutral-900` surface, `neutral-100` primary ink/button). Avoid raw `white`/`black` fills and per-component `dark:` variants. No router, no state library. Web-first: the macOS WKWebView wrapper inherits this UI, so native work stays in the shell. Sound is one offline WebAudio module (`src/sound.ts`, default on, single `notaeo:sound` toggle in SettingsDialog): boot lift, success confirm, a quiet universal tap tick via one delegated listener (`armTapSounds()` in `main.tsx`), and a settings preview that bypasses the mute gate; `index.css` pairs it with universal `:active` press physics that collapse under `prefers-reduced-motion`. `FolioLoader.tsx` stages the boot animation; `Checklist.tsx` renders the 4-item onboarding list fed by `GET /api/me/progress` merged with sticky local flags.

## Testing

- `backend/tests/` — feature folders keep API, auth, AI, core, ingest, search, study, export, and platform tests together. Root `conftest.py` sets `RESEARCH_DATA_DIR` to a temp dir per test and exposes an **authed** `client` fixture (registers one user, sends its bearer token). See `auth/test_auth.py` for register/login/logout/isolation coverage.
- Build checks: `cd backend && uv run pytest`; `cd frontend && npm test && npm run build && npm run lint`; `cd frontend && npm run e2e` for isolated iPhone/WebKit + Pixel/Chromium journeys; then `sh scripts/build_macos_app.sh` for the arm64 app bundle and sidecar smoke test. Remote E2E setup is documented in `frontend/e2e/README.md`.

## Next milestones

- **M3** — icon, native export/download handoff, and automated Xcode tests shipped. Distribution status is documented in `docs/MACOS_DISTRIBUTION.md`; streamed chat and public distribution work remain, with paid notarization optional for local builds.
- **M7 — SHIPPED (multi-user):** SQLite store, email auth (pbkdf2 + 30d sessions), per-user everything, login UI, JSON→SQLite migration script, private `research-server` self-host repo.
- **Next: verify Google OAuth end-to-end** (real client ID + web button flow), then Apple at App Store time ($99 program).
- **Owner vision (2026-09-29) — Notion for students:** grow the notes module into a block editor (slash commands, drag handles, inline `@source` citations linked to chunks), add academic citation exports (APA/MLA/BibTeX) from notebook sources, and make the app near-addictive with tasteful streaks/due badges/review celebrations built on the existing sound + press-physics language.
- **M5 — SHIPPED (student-ready v2 in working tree):** scheduled flashcards with grounded drafts, mobile review, glossary, quiz, Anki TSV export, keyless one-page study guides, keyless mind maps, in-app source reader, one-click demo notebook, and notebook zip export.
- **M4 polish** — possible follow-ups: persist research plans per notebook, cap bulk-add selections, retry failed adds.

## Keyless research mode (M4, shipped)

- Staged, frontend-driven pipeline — no background jobs. `POST /api/notebooks/{id}/research/plan|gather|synthesize` in `api/research.py`; algorithm in `core/research.py` (5-template heuristic planner with optional AI planner and line-based parse + heuristic fallback; URL-normalized cross-query ranking `3×queries + max(0,4−pos) + min(5,overlap)`, ≤2/domain, cap 15; digest builder). Shared cited-context helper lives in `core/context.py` (extracted from api/ai.py; used by chat and synthesis).
- Gather never ingests: the UI bulk-adds through the existing per-URL `/sources/url`. Failed queries degrade individually (0.35s `QUERY_DELAY`); 503 only when all fail. Synthesize falls back to the keyless digest on any AI error and records `{research_topic, queries, origin}` in source meta via `ingest_text(extra_meta=...)`.
- Frontend: `ResearchPanel.tsx` state machine (topic → editable query chips → ranked checklist with top-5 preselect → per-URL add progress → optional overview), wired into App.tsx between ChatPanel and SearchPanel.
- **Deep-research outlines (Deep-Research-skills-inspired, shipped):** persistent per-notebook outlines (SQLite-backed, per-user) with editable items + fields, human-in-the-loop at every stage (draft → edit → per-item deep pass → bulk add → outline-structured report). Heuristic draft reuses the 5 plan angles + 4 default fields; AI draft upgrades to concrete items/fields when configured. Same keyless guarantees as quick research (never ingests during deep pass, digest fallback, 503 only on total failure). UI: `OutlinePanel.tsx` under the Deep research tab.
- **Humanizer (humanizer-skill-inspired, shipped):** `core/humanize.py` implements 13 of the 25 public patterns as deterministic regex checks (staging, AI vocab, inflation, formatting, chat residue, rhythm). `POST /api/humanize/analyze` is keyless and notebook-free; `POST /api/humanize/rewrite` needs a configured key and accepts an optional voice sample. UI: `HumanizerPanel.tsx` under the Humanize tab.
- **Skills + memory (hermes-agent-inspired, shipped keyless subset):** global skills library (SQLite-backed, per-user; trigger-word matching, cap 3) and per-notebook memory notes. Both work with no key, and only reach a provider as prompt sections in chat/synthesis/report when AI is configured. Deliberately NOT vendored: Hermes gateway, messaging platforms, cron, subagents, TUI — all require keys/servers and would break keyless-first. UI: `SkillsPanel.tsx` under the Skills tab.
- **M5 — shipped**, see Next milestones (study kit: flashcards, guides, mind maps, reader, demo).
- **M6** — only then assess optional remote AI experiments; they must never gate the product.

## Parking lot

SQLite FTS5/sqlite-vec migration · chunk-level notes/annotations · source file-type passthrough (keep original bytes for re-parse) · field search (e.g. `title:`) · tag collections/folders · reader API (highlighted page text).
