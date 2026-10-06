# Product direction (locked)

Single source of truth for the product boundary, AI modes, platforms, and
hosted-launch legal needs. README, AGENTS.md, and HANDOFF.md summarize this;
if they disagree, this file wins and the disagreement is a bug.

## What `research` is

A free, local-first study app for school (MIT licensed): collect sources,
read them in-app, research the public web, and study with flashcards,
one-page guides, and mind maps. Self-hosting stays $0 — a SQLite file, no
paid service.

## Student workflow to build next

Owner selection, 2026-10-02: **AI exam coach — turn course material into
explanations, practice, and a revision plan.** This supersedes the earlier
evidence-capture → essay-workspace → planning milestone order. The immediate
need is: "My exam is coming up; what do I need to understand and revise next?"

AI can lead the experience and positioning. Source links and recorded practice
must make its suggestions assessable. Reading, basic planning, scheduled
review, and exports remain useful without a provider key or during outages;
accounts, ownership, and the hosted boundary below remain required. The first
exam-coach loop is implemented in the current working tree: save a notebook
exam goal and time budget, choose/reorder a source-linked revision session,
record written answers and self-ratings, then revisit missed topics in the
next session. AI practice and explanations are optional and fall back to
basic practice when unavailable or when their source evidence is invalid.
AI inference quality and student usefulness still require evaluation.

Build on the first loop in this order:

1. **Useful explanations:** select evidence for the question, link answers to
   source pages, and evaluate unsupported/absent answers before expanding AI
   surfaces.
2. **One revision session:** the implemented notebook goal, source material,
   and flashcard session accepts question selection/order within the saved
   time budget. Upcoming assignment/calendar integration and broader exam
   coverage remain future work.
3. **Practice and follow-up:** record attempts, revisit missed topics, and
   suggest the next session for an understandable reason. Written attempts
   and self-ratings now persist; AI grading and readiness estimates remain
   future work. Do not fabricate mastery percentages.

Evidence capture and cited essay writing remain useful later workflows. Class
management and calendars support exam preparation. External connections and
notifications require explicit consent and should not become a requirement
for local study. Proposed copy, demo, and acceptance criteria:
[Notaeo exam-coach draft](NOTAEO_DIRECTION_DRAFT.md).

## Public vs. private boundary

- **This repo (`research`, public, MIT)** holds the complete useful
  keyless/no-AI local/self-hosted product: ingestion, search, reader, study
  tools, exports, keyless public-web discovery, the shared responsive
  frontend/client behavior, the local service, and BYOK provider adapters.
- **Private `fordaaaa/research-server`** is a separate repository and owns hosted operations only: cloud
  accounts infrastructure, managed cloud storage/sync,
  subscriptions/entitlements, hosted AI credits/routing, rate limits and
  abuse controls, admin/operations tooling, and production
  secrets/infrastructure.
- Nothing in this repo may imply access to private code, and no hosted
  dependency may gate the local flows above.

## Accounts and AI

- **Accounts are required.** Every notebook, source, outline, card, skill,
  note, and AI key belongs to exactly one user; data routes enforce
  ownership and cross-user access is always 404. Email + password today
  (pbkdf2 hashes, hashed bearer tokens, 30-day sessions); Google OAuth next,
  Apple at App Store time.
- **AI is optional to configure; the exam-coach experience can lead with AI.**
  Three supported modes:
  1. **No-AI (first-class)** — discovery, ingest, search, reader, study
     tools, and exports work with no provider configured.
  2. **BYOK** — the user supplies their own key (Gemini, OpenRouter, or Groq),
     stored per-user; used only for chat, synthesis, reports, and rewrites,
     with keyless fallbacks wherever one exists.
  3. **Hosted credits (planned)** — a limited free allowance plus paid tiers
     later. Routing, entitlements, and billing live in the private
     `research-server`, not here.
- **No local LLMs** (no Ollama) by owner decision. Optional remote AI must
  never become a product dependency.

## Platforms

1. **macOS and Windows desktop first** — owner update, 2026-10-05. Build
   SwiftUI and WinForms interfaces with visible Settings and platform shortcuts,
   managed backend startup, and native file dialogs. This supersedes the
   previous macOS/web focus and Windows deferral.
2. **The standalone browser app is out of product scope for now.** The existing
   React code in `frontend/` is retained as legacy source, excluded from desktop
   packages. The owner explicitly selected native controls throughout.
   Development previews and browser tests only maintain the legacy code.
3. **iOS and Android live in the separate `research-mobile` repository.**
   Changes to this repo's React frontend do not automatically reach that app.
   Mobile work is paused while the desktop experience is the priority.
- **Local-runtime boundary (desktop):** the sidecar binds `127.0.0.1` only
  on an ephemeral port; the shell passes a per-launch `RESEARCH_DESKTOP_TOKEN`
  sent as `X-Notaeo-Desktop-Token` in API-only native mode (constant-time
  comparison, no browser exchange). This launch token alone grants no data —
  every data route still requires the account Bearer token. Desktop builds
  are same-origin only (no Vite CORS origin). `GET /api/runtime` states this
  boundary with no user data. Network egress stays explicit-only: web
  search, URL ingest, BYOK AI, and Google OAuth run solely on direct user
  action over HTTPS — no implicit sync, telemetry, proxy, or evasion.
- The Apple Developer Program ($99/yr) is budgeted only when App Store
  submission approaches — never as a build prerequisite.

## Hosted-launch legal checklist (owner + legal review required)

Before any hosted launch, the following must exist and be reviewed by a
lawyer. This list is a reminder, not legal advice; do not treat these docs
as drafting definitive legal claims:

- Terms of Service
- Privacy Policy
- Acceptable Use / AI-use terms
- Subscription and cancellation language
- Data retention, export, and deletion commitments
- Copyright / takedown handling
- Student and minor-data treatment

## Coding-worker policy

Every future coding worker must: write a meaningful failing test first,
implement, run targeted tests, run the repo-required broader checks, report
exact evidence, and commit only after reviewer approval. See AGENTS.md.
