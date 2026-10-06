# Practice/search quality and sound review — 2026-10-05

This batch improves the exam-coach loop, optional related lexical matching,
and the owner's requested cozy chime. Changes remain uncommitted.

## Changes and regression evidence

| Observed problem | Result |
| --- | --- |
| Basic sessions repeated the same supporting sentence | Identical/highly similar supporting passages are deduplicated within a session; number and negation differences are protected. |
| Frequency-ranked questions filled the budget before due cards | Missed topics, explicit focus topics and due cards precede fresh material; successful topics follow as honest review. |
| Rare missed topics disappeared when the original source was replaced | Candidate selection and quiz topic seeding include missed topics from the full completed history. |
| The first basic question could blank a repeated generic word | Named concepts at the start of their supporting sentence win fresh-question ties. |
| Edited missed flashcards reused an old answer | New drafts refresh card content while historical sessions retain snapshots. |
| Navigating discarded ungraded answers | Drafts are keyed by session/task, survive navigation and grading other questions, and clear when graded. |
| An explanation required another reveal before rating | Explanation results enable the same self-rating controls immediately. |
| Keyboard navigation dropped focus to the body | The new question heading receives focus. |
| Misspellings and supported alternate terms missed material | Opt-in related source search and shared chat-context groups add scoped aliases and unique one-edit corrections. |
| Success cues were bright and unpleasant; checks made sound | Quiet C4/E4 sine success chime, soft attack/continuous fade, gentler opening/button cues; disposable browser pages disable WebAudio including previews. |

Meaningful tests preceded implementation. Initial red runs showed missing
related-search support (13 failures), practice variety/ranking problems
(6 failures), draft/rating UX failures (3), and related toggle/API failures
(3). Additional coordinator regressions reproduced ATP matching unrelated
GTP text, generic first-question selection, stale edited cards, navigation
focus loss, and audible login test pages. All corresponding fixes pass.

## Independent OpenCode review

The startup gate exposed `ask_opencode`, `list_opencode_models`, and `zen_chat`;
the free-only CLI/model check passed. All workers used
`opencode/muse-spark-1.3-contributor-free` at `xhigh`.

Two coding jobs reached their 360-second timeout after writing regression
tests. The coordinator implemented the production changes; no native workers
were substituted. Bounded read-only backend and frontend reviews completed.

Backend verdict: **approve, no blockers** across related search, shared
context, search routing, coach selection, and owner-scoped latest review
history. The coordinator also removed duplicate question-term parsing and
renamed source grouping to avoid shadowing query groups.

Frontend review found keyboard focus loss, reproduced and fixed. A proposed
late-explanation/navigation race could not occur through the disabled
controls; a deferred-response regression verifies that navigation stays
disabled until completion and then clears the old explanation. Final
read-only follow-up: **approve, no blockers**.

## Final verification

- `cd backend && uv run pytest -q`: **372 passed**, seven upstream warnings.
- `cd frontend && npm test -- --maxWorkers=2`: **546 passed**, 232 files.
- Production frontend build passed, including the native build's rebuild.
- `npm run lint`: exit 0; React organization/effect warnings remain.
- Playwright with isolated ports 8011/5181 and throwaway data: **16 passed**
  across Pixel/Chromium and iPhone/WebKit. Covers no-AI study/note flows,
  coach goal/attempt/history, answer drafts, keyboard focus, typo recovery,
  opening sources, motion previews and reduced motion. Login pages now assert
  audio is disabled before UI interactions.
- `sh scripts/build_macos_app.sh`: passed; arm64 sidecar, Xcode build,
  ad-hoc signing and deep/strict signature verification. Output:
  `macos/build/Build/Products/Release/Notaeo.app`.
- The packaged sidecar passed a real desktop-cookie exchange (303 redirect),
  account registration, typo recovery, mixed source/card session, recording
  ratings, completion, and edited missed-card follow-up. The bundled frontend
  contains the updated search UI and chime. Only throwaway data was used and
  removed; no app GUI was launched or live provider contacted.
- `git diff --check -- . ':(exclude)backend/api/review.py'`: passed. The
  excluded file retains the owner's pre-existing whitespace edit.

An initial unrestricted frontend run had an existing App loading timeout
under parallel load and two broad text selectors that became ambiguous with
the new search hint. Those selectors now target the accessible result-count
status. The complete suite passes with two workers; browser coverage also
passes. Browser journey selectors were corrected to current accessible names.

## Limits

Native desktop follow-up: OpenCode reviews covered the API-only startup boundary
and macOS client contracts. Root review and correction covered native Windows
credentials, process callbacks and settings. Fixes include protected login
storage, matching-token expiry/logout, safe multipart filenames, strict loopback
readiness URLs, ownership before process callbacks, upload limits, pending-action
guards and authenticated ZIP exports. Regression checks caught real failures
before correction, including six Windows startup/credential cases and a late
macOS logout clearing a newer login. Native results are recorded in `HANDOFF.md`.
Windows UI/DPAPI runtime and live provider explanations were not exercised here.

Related matching is lexical with a deliberately small alias dictionary; it
does not cover general semantic paraphrases. Search retains text for the
requested page, but per-source dedupe hashes grow with distinct snippets,
and large offsets increase the heap. Large real course corpora need profiling.

Practice recommendations use self-ratings, heuristic passage similarity and
available material. They do not establish mastery or syllabus coverage.
Ungraded answer drafts last only while the coach panel is mounted; ratings
save responses to the backend. Sources currently permit title/tag edits,
not replacement of chunk text under the same identity. Future source editing
will need invalidation of saved retry references.

No live app AI inference, hosted infrastructure, real student data, or existing
development databases were used. Provider explanation quality, student
usefulness, and listening feedback remain evaluation work.
