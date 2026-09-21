# research

A free, local-first study app for school. Collect sources, read them in-app,
research the public web, and study with scheduled flashcards, source-grounded
quizzes and glossaries, one-page guides, and mind maps. Try the one-click demo
notebook to see every workflow in seconds. The core study workflow never needs
AI — but it does need an account (see below).

## Keyless promise and accounts

- **No-AI is first-class:** public-web discovery, source ingest, search,
  reading, study tools, and exports all work with no provider key
  configured.
- **Accounts are required:** register a local account (free, instant) and
  log in. Every notebook, source, outline, card, skill, note, and AI key
  belongs to exactly one user; cross-user access is always 404. Email +
  password today, Google OAuth next, Apple at App Store time.
- **Optional AI:** bring your own key (Gemini or OpenRouter, stored
  per-user) for chat, synthesis, reports, and rewrites — or wait for hosted
  AI credits (planned, limited free allowance + paid tiers later). No local
  LLMs by design.

## Stack

- **Backend** — Python 3.12, FastAPI, SQLite (`app.db`, WAL) with per-user
  rows everywhere, managed with [uv](https://docs.astral.sh/uv/)
- **Frontend** — React + TypeScript + Vite + Tailwind CSS (shared responsive
  UI for desktop shells and, later, mobile)
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
uv run uvicorn api.main:app --reload
```

Frontend (terminal 2):

```sh
cd frontend
npm install
npm run dev
```

Open http://localhost:5173 (register a local account — free, instant). The
dev server proxies `/api/*` to the backend on port 8000.

Mobile browser journeys run against isolated local servers by default:

```sh
cd frontend
npm run e2e
```

See [`frontend/e2e/README.md`](frontend/e2e/README.md) for iPhone/WebKit,
Pixel/Chromium, and opt-in deployed-backend testing.

## Desktop and mobile

- **macOS (alpha):** SwiftUI shell running the same local FastAPI backend
  and React UI over a loopback sidecar. Email login still applies; AI stays
  optional.

```sh
sh scripts/build_macos_app.sh
open macos/build/Build/Products/Release/Research.app
```

The build uses Xcode at `/Applications/Xcode-26.3.0.app` by default
(override with `DEVELOPER_DIR`). It produces a locally ad-hoc-signed
Apple-silicon app. Notebook data lives in
`~/Library/Application Support/research/data`, outside the app bundle.
Public notarization is intentionally not part of the $0 build.

- **Windows desktop** is next, then **iOS and Android** from the shared
  responsive UI wherever feasible.

## Roadmap

- [x] M0 — project scaffold (FastAPI + React)
- [x] M1 — source ingest (PDF, DOCX, TXT/MD, paste) with page-aware chunking
- [x] M2 — search & information management (ranked search, filters, tags, rename, URL ingest, markdown export)
- [x] M4 — keyless research mode (plan → web search → gather → cited source collection)
- [x] M5 — keyless study tools (scheduled flashcards, grounded drafts, glossary, quiz, study guides, mind maps, Anki/Obsidian export)
- [x] M7 — multi-user: SQLite store, email auth with per-user data, login UI, authenticated exports
- [ ] M3 — native desktop polish (macOS alpha → Windows) and distribution readiness
- [ ] M6 — optional remote AI experiments (BYOK today, hosted credits via the private server later), only if they add value without becoming required
