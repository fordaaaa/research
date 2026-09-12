# Product direction (locked)

Single source of truth for the product boundary, AI modes, platforms, and
hosted-launch legal needs. README, AGENTS.md, and HANDOFF.md summarize this;
if they disagree, this file wins and the disagreement is a bug.

## What `research` is

A free, local-first study app for school (MIT licensed): collect sources,
read them in-app, research the public web, and study with flashcards,
one-page guides, and mind maps. Self-hosting stays $0 — a SQLite file, no
paid service.

## Public vs. private boundary

- **This repo (`research`, public, MIT)** holds the complete useful
  keyless/no-AI local/self-hosted product: ingestion, search, reader, study
  tools, exports, keyless public-web discovery, the shared responsive
  frontend/client behavior, the local service, and BYOK provider adapters.
- **Private `fordaaaa/research-server`** owns hosted operations only: cloud
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
- **AI is optional.** Three modes, in priority order:
  1. **No-AI (first-class)** — discovery, ingest, search, reader, study
     tools, and exports work with no provider configured.
  2. **BYOK** — the user supplies their own key (Gemini or OpenRouter),
     stored per-user; used only for chat, synthesis, reports, and rewrites,
     with keyless fallbacks wherever one exists.
  3. **Hosted credits (planned)** — a limited free allowance plus paid tiers
     later. Routing, entitlements, and billing live in the private
     `research-server`, not here.
- **No local LLMs** (no Ollama) by owner decision. Optional remote AI must
  never become a product dependency.

## Platforms

1. **macOS and Windows desktop first** — native shells around the shared
   backend + responsive web UI. macOS alpha exists (SwiftUI shell, loopback
   sidecar, ad-hoc-signed arm64, data in Application Support, not
   notarized); Windows is next.
2. **Then iOS and Android**, built from the same shared responsive UI
   wherever feasible.
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
