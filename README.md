# research

A free, local-first NotebookLM alternative for school. Import sources, search and read them, and — optionally — chat with them or run deep research reports with an AI provider of your choice. Runs entirely on your machine. No accounts, no subscriptions, no data leaving your laptop unless you turn AI on.

## Stack

- **Backend** — Python 3.12, FastAPI, SQLite (FTS5 for search), managed with [uv](https://docs.astral.sh/uv/)
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

## Roadmap

- [x] M0 — project scaffold (FastAPI + React)
- [ ] M1 — source ingest (PDF, DOCX, URLs, pasted text)
- [ ] M2 — library, full-text search, reader (no AI needed)
- [ ] M3 — AI mode: cited chat with sources
- [ ] M4 — deep research mode (plan → search → gather → cited report)
- [ ] M5 — study tools (flashcards → Anki, quizzes, study guides)
- [ ] M6 — polish + desktop packaging
