# research

A free, local-first NotebookLM alternative for school. Import sources, search and read them, and — optionally — chat with them or run deep research reports with an AI provider of your choice. Runs entirely on your machine. No accounts, no subscriptions, no data leaving your laptop unless you turn AI on.

## Stack

- **Backend** — Python 3.12, FastAPI, JSON file storage (SQLite deferred until embeddings/scale demand it), managed with [uv](https://docs.astral.sh/uv/)
- **Frontend** — React + TypeScript + Vite + Tailwind CSS
- **AI (optional, off by default)** — pluggable free-tier providers (Groq, Google AI Studio, OpenRouter); the app is fully usable with AI disabled

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
page to the current notebook as a local source. Optional grounded chat uses a
Gemini API key you paste in Settings; the key stays in the local app data and AI
remains off until you enable it.

## Roadmap

Native macOS packaging is currently prioritized; capability work remains local-first.

- [x] M0 — project scaffold (FastAPI + React)
- [x] M1 — source ingest (PDF, DOCX, TXT/MD, paste) with page-aware chunking
- [x] M2 — search & information management (ranked search, filters, tags, rename, URL ingest, markdown export)
- [ ] M3 — native macOS app polish and distribution readiness
- [ ] M4 — deep research mode (plan → search → gather → cited report)
- [ ] M5 — study tools (flashcards → Anki, quizzes, study guides)
- [ ] M6 — optional AI mode: cited chat with sources + embeddings
