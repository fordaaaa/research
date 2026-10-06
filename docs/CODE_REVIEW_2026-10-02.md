# Cleanup and motion review — 2026-10-02

This is a bounded cleanup of search, notebook loading, chat lifecycle, loaders,
and flashcard interactions. It adds a motion preview and uses the same reveal
and thinking components in the app. It does not change provider contracts,
search ranking, database schema, ownership checks, or the private hosted boundary.
Changes are uncommitted.

The OpenCode bridge exposed all three required tools and passed the free-model
CLI check. Workers used `opencode/muse-spark-1.3-contributor-free` at `xhigh`.
The broad backend review timed out; a narrower implementation task completed.
Independent final and follow-up reviews approved the scoped changes. The coordinator
reviewed the implementation, corrected test/build issues, and verified it.

## Findings resolved

| Finding | Result |
| --- | --- |
| Search repeated source loading, stemming, and ranking to count results | `search_with_total` returns the page and deduplicated total from one computation; the existing list-returning `search` contract remains available. |
| Notebook opens fetched sources twice and kept a stale loading overlay | One guarded baseline request; leaving the notebook clears the overlay, and late responses cannot restore its sources. |
| Explicit search responses could overwrite newer results | Query, mode, unmount, and source-removal invalidation guard responses; the app forwards the abort signal to the fetch layer. |
| Older chat loading stayed busy after changing conversations | History epochs reset pagination loading and ignore stale responses. Notebook epochs guard late chat creation, deletion, and send results. |
| Parent rerenders restarted loader cadence; simultaneous SVGs shared an ID | Loader timing depends on stage count, and each instance has a unique filter ID. |
| Cancelled flashcard gestures saved grades; entry animation overrode dragging | Cancellation and lost capture clear the gesture without grading. Card entry and drag transforms use separate elements. |
| Card reveals needed reusable motion with stable keyboard focus | `FlashcardFace` animates the visible content, keeps the button mounted, and disables flipping while a grade saves. |
| Thinking ink did not follow Night surfaces | Default orb ink follows app appearance changes and disconnects its observer on unmount. Explicit theme overrides remain available. |
| Browser tests retained old brand/auth/mobile selectors | Tests use current accessible roles, the auto-open paste editor, and explicit notebook delete confirmation. |

## Trying motion

In the web app or freshly built macOS app, sign in and open **Settings → Motion
→ Try motion**. Select Loading, Flashcards, or AI thinking. Thinking offers nine
styles plus manual sample answer/error controls and replay. Stop preview or
close Settings to unmount it. No preview action sends a provider request or
saves study progress. Actual chat still requires an optional configured AI
provider; preview outcomes are samples, not provider reasoning or streamed output.

OS reduced-motion preferences apply to CSS effects, loader stage cycling, and
thinking orbs. Preview buttons and answers remain usable with motion reduced.

## Evidence

Regression tests ran before their corresponding fixes. Failures demonstrated
duplicate search loads, duplicate notebook fetches, stale source/web/chat
responses, stuck pagination/loading state, loader cadence resets and filter-ID
collisions, cancelled swipe grades, disabled-state/focus behavior, missing
preview controls, and Night-theme contrast.

Final checks:

- `cd backend && uv run pytest -q`: **298 passed**, 7 upstream deprecation warnings.
- `cd frontend && npm test -- --maxWorkers=2`: **523 passed**, 224 files.
- `cd frontend && npm run build`: passed, also rerun by the native build.
- `cd frontend && npm run lint`: exit 0; React organization/effect warnings remain.
- Playwright: **10 passed**, Chromium/Pixel and WebKit/iPhone. Includes the real
  no-AI source/study/note journey and preview/reduced-motion tests. A temporary
  config used ports 8011/5181 and a throwaway data directory because port 8000
  already held the owner's backend. No existing database was used.
- `sh scripts/build_macos_app.sh`: passed; arm64 sidecar smoke check, app build,
  ad-hoc signing, and signature verification succeeded.
- `git diff --check -- . ':(exclude)backend/api/review.py'`: passed. The excluded
  file retains the owner's pre-existing trailing-whitespace-only edit.

The preview browser tests mock only actual `/api/` requests, allowing development
module imports under `/src/api/` to load. They assert zero API requests during
preview interactions and do not need credentials or provider keys.
# Exam-coach follow-up

The owner selected an AI exam coach (material → explanations/practice/revision
plan). Three further OpenCode investigations covered positioning, retrieval,
and free providers. Workers implemented query-aware chat context and optional
Groq keys; independent product and code reviews followed. The revision
session/attempt loop was implemented in the subsequent batch below.

Coordinator integration caught and fixed two material issues with observed
failing tests first:

- A global top-50 candidate pool dropped short meiosis evidence behind eighty
  repetitive mitosis chunks. Bounded distinct-topic representatives now
  survive the cutoff before source interleaving. The comparison regression
  passes; a vacuous worker assertion was replaced with an exact source set.
- Settings reload coerced Groq to Gemini through the old provider whitelist.
  Supported-provider registry validation fixes both reload and real API chat
  dispatch. Store and API regressions failed before the fix and now pass.

Final independent OpenCode verdict: approved, no material blockers. Remaining
limits: lexical retrieval misses synonyms/typos; keyword search retains its
AND contract; provider inference/answer factuality were mocked, not evaluated
live; hosted allowance is outside this repository.

Follow-up verification: backend `325 passed`; frontend `527 passed` in 225
files (`npm test -- --maxWorkers=2`); production build passes; lint exits 0
with existing warnings; eight Chromium/WebKit auth, mobile journey, and motion
tests pass with isolated data and ports; native build succeeds with signed
arm64 sidecar/app. Existing dev server :8000 requires restart for new provider
support. User-owned dev processes and the pre-existing review.py whitespace
edit remain preserved. No commits were created.

## Exam-coach implementation and review

The first loop is implemented: notebook goal/date/time/focus → editable task
selection/order → written answers and self-ratings → completion → missed-topic
follow-up. Basic practice uses source excerpts and cards without a key. AI
practice is optional, source-linked, and falls back on invalid output. Home
uses "Know what to study next" and links into the chosen course's coach.
Usage, contracts, and limits: [EXAM_COACH.md](EXAM_COACH.md).

OpenCode implementation jobs failed (backend CLI exit 1, frontend CLI exit 1)
without producing implementation files; an initial bounded glossary review
timed out. The coordinator took over coding. A later independent read-only
OpenCode review succeeded and found five issues. Observed failing regression
tests preceded each fix:

- AI explanations now respect the AI toggle as generation does.
- Building requires saving dirty goal fields, preventing a stale saved goal.
- Rating the final question preserves its position.
- Recommendations use latest ratings over all completed history while the
  displayed session list remains bounded to twenty.
- AI explanations require bounded structured output, a literal supporting
  quote, and valid supplied-source citation numbers. Invalid responses return
  the reference answer and a notice.

Coordinator checks also found that rare explicit focus terms could disappear
behind common terms from repetitive lectures. A regression using Meiosis on
page 101 now passes with that topic first, without hydrating a full source.
Glossary reference excerpts contain their selected term; concurrent writes
retain both attempts, and concurrent finish requests count progress once.

Final OpenCode follow-up approved: all five findings resolved, no remaining
concrete blockers in inspected files. Its qualification remains applicable:
quote/citation validation does not prove factual correctness or relevance.
Provider calls were mocked for tests; live answer quality was not evaluated.

Final verification: backend **345 passed** (7 upstream warnings); frontend
**536 passed** in 228 files; **10 passed** in Chromium/Pixel and WebKit/iPhone,
including the real goal/practice/reload/follow-up flow and 320px fit. Production
build and lint pass (lint retains React warnings). Browser servers used
isolated ports 8011/5181 and throwaway data. No commits or live provider calls.
`sh scripts/build_macos_app.sh` rebuilt the production frontend and signed
arm64 Notaeo.app successfully, with deep/strict signature verification.
The bundled executable passed a real isolated-data API smoke flow covering
desktop cookie exchange, login, source/goal creation, selected practice,
completion, and next-session missed-topic priority. Its temporary data was
removed and its process stopped.
`git diff --check -- . ':(exclude)backend/api/review.py'` passes; the excluded
file retains the pre-existing user-owned whitespace edit.
