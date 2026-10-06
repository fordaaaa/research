# Notaeo

![Local-first research notebook](docs/images/repository-preview.jpg)

A free desktop exam coach for school. Collect course materials, read them in-app,
set an exam goal, and work through a short revision session. The native workflow
supports written answers, source-based explanations and saved self-ratings.
AI is optional; an account is required.

**Know what to study next.** The first **exam coach** loop now lets you save an
exam goal and time budget, choose a short revision session, record answers,
and revisit topics you marked missed. Create a notebook, import your material,
then open **Exam coach**. AI practice and explanations are optional; see the
[exam-coach guide](docs/EXAM_COACH.md) and [product direction](docs/PRODUCT.md).

**Current focus: installed macOS and Windows apps.** The standalone browser
product is paused. Desktop interfaces are being rebuilt with SwiftUI on macOS
and WinForms on Windows. `frontend/` remains legacy source and is excluded from
desktop packages; mobile development in `research-mobile` is paused.
Flashcard management, notes, general chat, mind maps and public-web discovery
still need native screens; their existing backend APIs remain available.

## Keyless promise and accounts

- **No-AI is first-class:** public-web discovery, source ingest, search,
  reading, study tools, and exports all work with no provider key
  configured.
- **Accounts are required:** register a local account (free, instant) and
  log in. Every notebook, source, outline, card, skill, note, and AI key
  belongs to exactly one user; cross-user access is always 404. Email +
  password today, Google OAuth next, Apple at App Store time.
- **Optional AI:** the local app supports per-user Gemini, OpenRouter, or Groq keys;
  the separate hosted server offers OpenCode free-model chat when configured.
  No local LLMs by design.

To test a free AI tier, open Settings, select **Groq**, and add your own API
key from [Groq Console](https://console.groq.com). The default is
`openai/gpt-oss-20b`, with a same-provider `openai/gpt-oss-120b` fallback.
Account quotas apply; no key or free hosted allowance is bundled. Chat selects
passages using the question, but retrieval is lexical and can still miss
paraphrases. Source Search's **Find related passages** option adds a small
academic alias dictionary and unambiguous one-edit typo correction; keyword
search remains the default. [Search and practice details](docs/EXAM_COACH.md).

## Stack

- **Backend** — Python 3.12, FastAPI, SQLite (`app.db`, WAL) with per-user
  rows everywhere, managed with [uv](https://docs.astral.sh/uv/)
- **Desktop interface** — SwiftUI on macOS, WinForms on Windows, native controls
  calling the local API; legacy React code remains in `frontend/`
- **Keyless discovery** — public-web search through DDGS; needs no provider
  key, and results become local sources after ingest
- **License** — MIT

## Public vs. private

This repo is the complete useful keyless/no-AI local/self-hosted product:
ingestion, search, reader, study tools, exports, discovery, shared UI,
local service, and BYOK adapters. Hosted operations (managed storage/sync,
subscriptions/entitlements, hosted AI credits/routing, rate limits, admin
tooling, production secrets) live in the private `fordaaaa/research-server`
and are never required here. Details: [`docs/PRODUCT.md`](docs/PRODUCT.md).

## Development

Backend (terminal 1):

```sh
cd backend
uv sync
uv run uvicorn api.main:app --reload --no-proxy-headers
```

Legacy browser interface (optional, for maintaining existing code only):

```sh
cd frontend
npm install
npm run dev
```

The developer preview at http://localhost:5173 proxies `/api/*` to the backend
on port 8000. It is an internal engineering tool. Use the installed app for
the desktop experience.

Renderer browser checks run against isolated local servers by default:

```sh
cd frontend
npm run e2e
```

See [`frontend/e2e/README.md`](frontend/e2e/README.md) for iPhone/WebKit,
Pixel/Chromium, and opt-in deployed-backend testing.

## Desktop and mobile

- **macOS (alpha):** SwiftUI interface calling the local FastAPI API
  over a loopback sidecar. Email login still applies; AI stays
  optional.

```sh
sh scripts/build_macos_app.sh
open macos/build/Build/Products/Release/Notaeo.app
```

The build uses Xcode at `/Applications/Xcode-26.3.0.app` by default
(override with `DEVELOPER_DIR`). It produces a locally ad-hoc-signed
Apple-silicon app. Notebook data lives in
`~/Library/Application Support/research/data`, outside the app bundle.
Public notarization is intentionally not part of the $0 build.

Local privacy boundary: loopback-only sidecar (`127.0.0.1`, ephemeral
port) + per-launch native request token, with email login still required
on every data route. `GET /api/runtime` reports the boundary. Network use
is explicit-only (web search, URL ingest, BYOK AI, Google OAuth) — no
implicit sync. Details: [`docs/PRODUCT.md`](docs/PRODUCT.md).

- **Windows desktop** is now an active target. Its shell and packaging live
  under `windows/`; Windows runtime verification is required before release.
  The iOS and Android client lives in the separate `research-mobile` repository.

On Windows with uv, Python 3.12, and the .NET 10 SDK installed:

```powershell
.\scripts\build_windows_app.ps1
.\windows\build\Notaeo\Notaeo.exe
```

The package includes the .NET runtime and Python API sidecar; no browser
renderer or WebView runtime is required.

## Roadmap

- [x] M0 — project scaffold (FastAPI + React)
- [x] M1 — source ingest (PDF, DOCX, TXT/MD, paste) with page-aware chunking
- [x] M2 — search & information management (ranked search, filters, tags, rename, URL ingest, markdown export)
- [x] M4 — keyless research mode (plan → web search → gather → cited source collection)
- [x] M5 — keyless study tools (scheduled flashcards, grounded drafts, glossary, quiz, study guides, mind maps, Anki/Obsidian export)
- [x] M7 — multi-user: SQLite store, email auth with per-user data, login UI, authenticated exports
- [ ] M3 — native desktop polish (macOS alpha → Windows) and distribution readiness
- [x] Exam-coach first loop — saved goal → selected revision session → recorded answers/self-ratings → missed-topic follow-up, with optional AI
- [ ] Exam-coach evaluation — real course coverage, explanation quality, student usefulness, and calendar integration
- [ ] M6 — remote AI quality, provider options, and streamed responses; hosted allowance belongs in the separate private server
