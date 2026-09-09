# research

A free, local-first study app for school. Collect sources, read them in-app,
research the public web, and study with flashcards, one-page guides, and mind
maps — with no account or API key. Try the one-click demo notebook to see every
workflow in seconds. Runs on your machine; your core study workflow never
depends on a model or a remote provider.

## Stack

- **Backend** — Python 3.12, FastAPI, JSON file storage (SQLite deferred until embeddings/scale demand it), managed with [uv](https://docs.astral.sh/uv/)
- **Frontend** — React + TypeScript + Vite + Tailwind CSS
- **Keyless discovery** — public-web search through DDGS, with no account or API key
- **Remote AI (optional, off by default)** — a user may add a free-tier key, but it is never required for the product to work

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

Open http://localhost:5173. The dev server proxies `/api/*` to the backend on port 8000.

## macOS app

The native macOS app is the current priority. It is a SwiftUI shell that runs the
same local FastAPI backend and React interface; it has no account, subscription,
or AI requirement.

```sh
sh scripts/build_macos_app.sh
open macos/build/Build/Products/Release/Research.app
```

The build uses Xcode at `/Applications/Xcode-26.3.0.app` by default (override
with `DEVELOPER_DIR`). It produces a locally ad-hoc-signed Apple-silicon app.
Notebook data lives in `~/Library/Application Support/research/data`, outside the
app bundle. Public notarization is intentionally not part of the $0 build.

Web discovery works with no account or AI key: search public results, then add a
page to the current notebook as a local source. The optional Gemini integration
is deliberately secondary; the main product direction is keyless research.

## Roadmap

Native macOS packaging and keyless research are the current priorities.

- [x] M0 — project scaffold (FastAPI + React)
- [x] M1 — source ingest (PDF, DOCX, TXT/MD, paste) with page-aware chunking
- [x] M2 — search & information management (ranked search, filters, tags, rename, URL ingest, markdown export)
- [ ] M3 — native macOS app polish and distribution readiness
- [x] M4 — keyless research mode (plan → web search → gather → cited source collection)
- [x] M5 — keyless study tools (flashcards + practice mode, study guides, mind maps, Anki/Obsidian export)
- [ ] M6 — optional remote AI experiments, only if they add value without becoming required
