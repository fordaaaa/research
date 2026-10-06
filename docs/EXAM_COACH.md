# Exam coach: first implementation

Updated 2026-10-05, current working tree. Notaeo's entry point is **Know what to study
next**. On Home select a course notebook and choose **Plan exam revision**;
the notebook's **Exam coach** tool is also available under Learn on mobile.

## Try the loop

1. Import your course material or create flashcards. Save an exam title, date,
   study time (5–120 minutes), and optional comma-separated focus topics.
2. Build a revision session. Select questions, change their order, and start.
   The selected questions fit the goal's saved time budget.
3. Write an answer before revealing its reference. Open the supporting source
   or request an explanation. Choose **Got it** or **Revise again** to save
   your answer. Unrated drafts survive moving between questions while the
   coach panel stays open; leaving it or reloading discards those drafts.
4. Rate every selected question, then finish. Answers and ratings survive a
   reload. Build the next session to revisit topics whose latest completed
   rating was **Revise again**. Marking them **Got it** removes that reason
   from subsequent recommendations.

The recent-session UI shows twenty sessions; recommendation memory considers
all completed history. A started session keeps its original goal snapshot
when the saved goal changes. Finish it before building another. Selection
and order are editable before starting; completed answers are read-only.

The next session prioritizes missed topics, explicit focus topics, due cards,
then new material. Previously successful questions remain available as review
when fresh material runs out, with an honest review reason. Basic practice
avoids identical and highly similar supporting passages within a session.
Edited missed flashcards use their current content in the next draft; saved
sessions retain their original question and answer snapshots.

## Finding related material

Source Search defaults to keyword matching. Enable **Find related passages**
to allow partial question coverage, a small academic alias dictionary, and
unambiguous one-edit corrections for unmatched terms of at least five stemmed
characters. Ambiguous corrections are ignored, and quoted phrases remain
literal. Exact matches rank above aliases, then corrections. Filters,
pagination totals, original snippets and source/page provenance are preserved.
Chat uses the same expansion groups when selecting context. These are lexical
heuristics; general paraphrases and unsupported synonyms can still be missed.

## Optional AI and motion

Configure an optional per-user Gemini, OpenRouter, or Groq key in Settings.
**Use AI for practice** controls both generation and explanations. Requests
use the shared thinking animation while the real provider call is pending.
Settings → Motion → Try motion offers sample states without a provider call.

AI-generated practice must cite an available chunk and use a verbatim answer
from that chunk. Explanations must return a supporting quote present in the
supplied evidence, bounded answer text, and valid citation numbers. Failures
return basic practice or the saved reference answer with a notice. This
validation checks evidence and citation structure; it cannot prove that an
AI explanation's interpretation is correct. No live provider inference was
used to verify this batch. Students still compare explanations with sources.

Basic practice, saved cards, and the entire goal/attempt loop work without an
AI key. There is no bundled provider credential, unlimited AI promise, local
LLM, or hosted allowance in this repository.

## Storage and API

Additive SQLite `coach_goals` and `coach_sessions` tables are created at startup.
Notebook deletion cascades to both. Ownership is checked in HTTP routes and
coach storage methods; foreign notebooks/sessions/tasks return 404. All
writes to a session occur under a SQLite write transaction. Retried attempts
upsert by task; retrying or concurrently finishing counts review progress once.

All routes below are relative to `/api/notebooks/{notebook_id}/coach` and
require authentication:

| Method/path | Request | Result |
| --- | --- | --- |
| GET `/` | — | Saved goal and recent sessions |
| PUT `/goal` | `title`, `exam_date`, `daily_minutes`, `focus_topics` | Saved goal |
| POST `/sessions` | `use_ai` | New draft; 201 |
| POST `/sessions/{id}/start` | `task_ids` in desired order | Active session |
| POST `/sessions/{id}/attempts` | `task_id`, `rating`, `response` | Updated session |
| POST `/sessions/{id}/finish` | — | Completed session |
| POST `/sessions/{id}/tasks/{task_id}/explain` | `use_ai` | Answer, source citations, generation mode, fallback notice |

Ratings are `got_it` or `revise`. Invalid state transitions return 409;
invalid selection or missing material returns 400. The frontend uses the
shared authenticated API layer and cancels/discards stale notebook requests.
Source candidates are scanned in pages with a bounded retained pool. Explicit
focus topics precede frequency-ranked glossary terms so a brief passage in
a long lecture can still become the first practice question.
Related search scans chunks in pages and retains a result heap sized to the
requested offset plus limit. Deduplication hashes grow with distinct snippets
within a source; high offsets and very large notebooks still need profiling.

## Current limits

This is a short revision session based on available material and self-ratings.
It does not automatically grade free-text responses, predict an exam score,
prove whole-course coverage, or distribute a syllabus across future dates.
Assignment/calendar integration, semantic retrieval, streaming answers, and
live model-quality/student evaluation remain follow-up work.

Implementation and review evidence are recorded in HANDOFF.md and
[the quality review record](CODE_REVIEW_2026-10-05.md).
