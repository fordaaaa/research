# AI and retrieval research

Reviewed 2026-10-02. Provider limits can change. No live inference requests,
account secrets, real user documents, or private research-server files were
used in this investigation.

## Why the current experience feels weak

Keyword search requires every query term in the same chunk. Quoted phrases
are exact; suffix stemming is limited; the only prefix fallback is a single
token. Natural questions, comparisons across passages, synonyms, and typos
can return nothing. Searching also hydrates source bodies in Python; the
earlier single-pass-total optimization reduces duplicate work but does not
improve relevance.

Chat previously ignored the question when choosing evidence: build_context
walked sources in list order and stopped at roughly 14,000 characters. A
later relevant source could be invisible to the provider. Changing models
alone cannot recover material omitted from the prompt.

### Observed lexical baseline

A temporary SQLite fixture contained a mitochondria lecture (page 1), plant
notes about photosynthesis/sunlight/glucose (page 4), and separate mitosis and
meiosis chunks (pages 7 and 8). The coordinator ran Store.search against these
five queries with no provider calls:

| Question | Keyword result |
| --- | --- |
| What does the mitochondria do? | Lecture |
| How does photosynthesis convert sunlight into energy? | No results |
| Why is the powerhouse of the cell important? | No results |
| Compare mitosis and meiosis phases | No results |
| photosyntesis steps | No results |

This is a small reproducible diagnostic, not a measured production success
rate. The first two absent questions still contain useful retrieval terms;
the comparison needs both passages. The misspelling needs a separate solution.

After the query-aware chat change, the coordinator reran the same temporary
fixture. Selected excerpts included Lecture page 1 for the mitochondria
question, Plant notes page 4 for photosynthesis, Lecture page 1 for the
powerhouse question, and both Division notes pages 7 and 8 for the comparison.
Partial ranking also selected extra passages for the photosynthesis/powerhouse
questions. The misspelling matched nothing and used the sequential fallback.
Keyword-search behavior is unchanged. These observations verify passage
selection only; no model-generated answers or exam outcomes were evaluated.

### Bounded improvement

Select chat excerpts using question terms, partial lexical coverage, and
relevance ranking over paginated chunks. Keep candidate memory bounded,
retain complete passage/page information, and number citations only after
selection. Keep sequential context for whole-notebook synthesis and when no
useful question match exists. This is lexical retrieval, not semantic search.

Preserve the explicit AND/quoted-phrase contract of keyword search. A next
search change should expose a separate relevance mode with partial-match
information, then introduce SQLite FTS5/BM25 and evaluated typo handling.
Remote embeddings can later improve paraphrases, with an explicit data route
and quota; no local LLM is required. FTS alone will not understand synonyms.

Before expanding search, create a twenty-question fixture covering exact
facts, multi-page comparisons, paraphrases, typos, and absent answers. Measure
expected source/page in the first three retrieval results, compare-question
coverage, and false matches for unrelated questions. Separately verify that
an answer's citation numbers refer to supplied passages and that the passages
actually support the claim. Correct numbering alone is not factual validation.

## Free-provider recommendation

**Use Groq as an optional personal-key provider for the prototype.** Its
OpenAI-compatible API fits the existing small adapter design. Production
model IDs include openai/gpt-oss-20b and openai/gpt-oss-120b. Choose 20b for the
initial default and 120b as a same-provider fallback; evaluate answer quality
before claiming either is the best student model. [Compatibility](https://console.groq.com/docs/openai),
[models](https://console.groq.com/docs/models).

| Provider | Current official evidence | Recommendation |
| --- | --- | --- |
| Groq | Free-plan GPT-OSS models: 30 requests/minute, 1,000/day, 8,000 tokens/minute, 200,000 tokens/day; quotas apply to the organization and account limits may differ | Personal-key testing now; a shared allowance requires capacity planning. [Limits](https://console.groq.com/docs/rate-limits) |
| OpenRouter | Free variants and platform/upstream rate limits; availability is model/provider-dependent | Keep existing support; verify the selected free model and account quota rather than promising fixed availability. [Limits](https://openrouter.ai/docs/api_reference/limits), [free variants](https://openrouter.ai/docs/guides/routing/model-variants/free) |
| Gemini | Existing integration; free access has age, region, and data-use restrictions | Do not choose as the default for a school-age audience without resolving its under-18 client restriction. [Terms](https://ai.google.dev/gemini-api/terms) |
| Cerebras | Current docs say no permanently renewing free tier: verified payment method, $5 trial credit, expiry after 30 days | Exclude from the recurring-free recommendation. [Limits and trial FAQ](https://inference-docs.cerebras.ai/support/rate-limits) |
| OpenCode Zen | Free models are time-limited; data policies vary by model | Continue using authorized coding agents; investigate hosted app inference separately rather than depending on an interactive CLI login. [Zen](https://opencode.ai/docs/zen/) |

Example capacity estimate, not a provider promise: at 6,000 total tokens per
answer, a 200,000-token daily budget buys about 33 answers. A shared key gives
that budget to the whole application, not each student. Per-user keys avoid
sharing the app owner's quota but add onboarding friction. Configure limits
and check the actual account before live testing.

Groq offers controls for inference retention, including zero data retention;
default inference data can still be retained for reliability/abuse cases.
Select the desired account controls before sending student material.
[Data controls](https://console.groq.com/docs/your-data).

Gemini's terms prohibit clients directed toward or likely accessed by under-18s,
require paid services for clients offered in the EEA/Switzerland/UK, and allow
unpaid-service content use for improvement and human review, with regional
distinctions. These restrictions matter to the proposed audience; free pricing
alone is not sufficient provider selection. [Gemini terms](https://ai.google.dev/gemini-api/terms).

Zen documents temporary free access and model-specific privacy exceptions;
some free endpoints collect improvement data. That is unsuitable as an
unexamined promise about private schoolwork. [Zen privacy](https://opencode.ai/docs/zen/#privacy).

## Public implementation versus hosted service

This repository can add a per-user Groq adapter and settings choice, retain
existing Gemini/OpenRouter keys, and improve retrieval without touching
hosted infrastructure. No key is bundled or returned in settings responses.
No provider is silently switched across accounts.

AI available to students without personal keys needs a hosted allowance:
quota accounting, abuse controls, approved routing, disclosure, and honest
exhaustion behavior. Those operations belong in the private research-server;
this investigation does not access or implement them. Local hosted status
continues to report disabled.

Keep responses bounded and distinguish missing key, exhausted quota, and
temporary provider failure. Later work: request deadlines/cancellation,
streamed answer text, and retrieval/citation evaluations. Thinking animation
is a request-status indicator; it does not expose the provider's internal
reasoning. The existing motion preview can exercise waiting/success/error
without a key.
