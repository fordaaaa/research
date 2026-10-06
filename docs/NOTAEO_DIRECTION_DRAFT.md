# Notaeo: AI exam coach proposal

Draft, 2026-10-02. Responds to the owner's request for a clearer student need,
stronger AI emphasis, better search, and free-provider options. This is a
feature/copy proposal under the exam-coach direction now recorded in
PRODUCT.md; account, privacy, and hosted-boundary decisions still apply. The
owner selected **exam coach: explanations, practice, and a revision plan**
during this investigation. Three
OpenCode agents independently reviewed positioning, retrieval, and providers;
the coordinator selected and refined this direction.

## The need

"My exam is coming up. I have slides and readings, but I don't know what I
understand, what I'm missing, or what to revise first."

Notaeo should become an **AI exam coach**: it turns course material into
explanations, practice, and a revision plan tied to the student's next exam.
Each visit should produce a small, achievable study session and a way to check
understanding. A library, calendar, or chat box alone does not deliver that
promise.

AI can lead the experience through explanations, practice, and suggested
plans. Accounts and data ownership stay required. Reading, basic planning,
review, and exports should still work during provider outages or exhausted
quotas. Present that resilience as product reliability; it need not be the
marketing headline. No local LLMs or paid-service dependency are proposed.

## Recommended copy

**Slogan:** Know what to study next.

**Positioning:** Notaeo is your AI exam coach. Understand your course material,
practise the topics you miss, and build a revision plan before your exam.

**Homepage direction:**

> Know what to study next.
>
> Turn your lecture slides and readings into clear explanations, exam
> practice, and a revision plan that focuses on what you still need to learn.
>
> Build my revision plan

The first plan/practice loop now exists in the working tree. Home uses
"Know what to study next" and a course selector leading to "Plan exam revision".
Describe the current revision plan as a short session, with recorded
self-ratings. Full curriculum coverage and independently evaluated AI
explanation quality are not established.

Other slogan directions:

- Your next exam, one clear plan.
- Less catching up. More understanding.
- From class notes to exam confidence.
- Know what's due. Remember what matters.
- Revise the right things before exam day.

The broader student manager and assignment assistant were considered as
alternatives. Focus this milestone on exam preparation. Classes and deadlines
support that loop; they do not need to become a separate management product.

## A demo that makes the need obvious

Demo scenario: a biology exam is Friday, the student has lecture slides,
and only twenty minutes to study.

1. Add the material, choose the exam date, and set twenty minutes available.
   Notaeo proposes a short session with named topics and source links.
2. Start the first task. Ask about a confusing topic; the explanation opens
   the supporting page. Try a few questions and mark what was difficult.
3. Finish with a clear record of what was practised and a suggested next
   session based on missed questions and the remaining deadline.

The first success is "I know what to do now and I understood something."
The reason to return is unfinished preparation and scheduled review, not
collecting more documents or maintaining a streak alone.

## What already exists, and what needs building

| Capability | Current status | Work needed for this promise |
| --- | --- | --- |
| Classes, assignments, calendar | Implemented; Classroom requires operator OAuth credentials and authorized Classroom users | Surface assignment-to-notebook links and an upcoming-exam goal |
| Uploaded, pasted, and URL material | Implemented with reader and local export | Make adding exam material part of the study-session flow |
| Due cards and cross-notebook review | Implemented | Link sessions and missed topics to the student's goal |
| Source-grounded chat | Optional per-user provider keys | Select passages for each question; evaluate citations and abstention |
| Glossary, quiz, guide, mind map | Implemented with deterministic generation | Evaluate quality before claiming adaptive or AI-generated practice |
| Short revision session | Implemented in the working tree | Persisted goal/date/time budget, source-linked questions, selection/order, explicit start; evaluate course coverage |
| Attempts and missed-topic follow-up | Implemented in the working tree | Written answers/self-ratings persist; latest missed topics lead the next session, including older history |
| Readiness estimate | Not implemented | Record actual attempts; show evidence and uncertainty, not a fabricated mastery score |
| In-app loading, review, and thinking motion | Preview and coach request states implemented | Thinking follows actual AI request lifetime; student testing remains |
| Hosted AI without personal keys | Disabled in this repository | Implement allowance/routing in the private research-server only |

## Build order and acceptance criteria

1. **Make answers useful.** Query-aware passage selection and optional Groq
   support are the bounded first work; verification is recorded separately in
   HANDOFF.md. Evaluate late-source questions,
   comparison questions, irrelevant questions, and absent evidence. Keep source
   page links correct. Streaming can follow once retrieval is credible.
2. **Ship one study session.** Add an exam goal, available minutes,
   and a suggested session using existing deadlines/cards plus course excerpts.
   The student can edit/accept the plan. AI failure still produces a useful
   session from due cards and upcoming work. Acceptance: a new student can
   start a source-linked twenty-minute session without composing a chat prompt;
   without a key, a basic session still works and labels available capabilities.
3. **Close the loop.** Record attempts, let the student revisit missed topics,
   and propose the next session. Acceptance: finishing a session changes the
   next recommendation for a visible reason, and progress survives reopening.

Do not add more generic chat surfaces before the study session connects them.
Do not launch with "unlimited free AI", automatic exam success, or a readiness
percentage unsupported by actual answers.

## Product validation

Show the three-step prototype to five students with an upcoming exam. Have
them bring one real set of material and a deadline. Observe whether they can
start without guidance, whether answers open the right passage, and whether
they choose to return for another session. Ask what tool/workflow this would
replace. These are proposed tests, not completed interviews or market proof.

Technical search evidence and provider tradeoffs are in
[AI and retrieval research](AI_RETRIEVAL_RESEARCH_2026-10-02.md).
