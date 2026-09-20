"""Keyless humanizer checks: flag AI-sounding patterns without rewriting meaning.

Inspired by the public humanizer skill's pattern list (staging, rhythm-by-rule,
inflation, formatting-by-rule, chat leftovers). Every check is a deterministic
regex heuristic that works with no provider. The optional AI rewrite lives in
the API layer and only runs when the user configured a key.
"""
from __future__ import annotations

import re
from dataclasses import dataclass


@dataclass(frozen=True)
class Pattern:
    key: str
    label: str
    suggestion: str
    regex: re.Pattern[str]
    max_hits: int = 5


_PATTERNS: list[Pattern] = [
    Pattern(
        "not_x_but_y",
        "Not-X-but-Y contrast",
        "State the point directly instead of framing it as a contrast.",
        re.compile(r"\bnot (?:just|merely|only|simply)\b[^.!?]{0,80}?\bbut\b", re.IGNORECASE),
    ),
    Pattern(
        "staged_runup",
        "Staged run-up before the point",
        "Cut the run-up and state the point in the first sentence.",
        re.compile(
            r"\b(let'?s dive in|delve into|honestly\?|in today'?s (?:fast-paced )?world|"
            r"it is important to note|it'?s worth noting|in conclusion|at the end of the day)\b",
            re.IGNORECASE,
        ),
    ),
    Pattern(
        "unraised_objection",
        "Arguing with no one",
        "Remove the unraised objection; keep any real claim it contains.",
        re.compile(
            r"\b(this isn'?t (?:mainly|just|merely) about|a tempting approach would be|"
            r"some might argue|one might (?:argue|think)|straw ?man)\b",
            re.IGNORECASE,
        ),
    ),
    Pattern(
        "saying",
        "Saying that sounds deep",
        "Replace the saying with the specific claim it stands in for.",
        re.compile(
            r"\b(at its core|speak volumes|the (?:very )?(?:fabric|tapestry|landscape) of|"
            r"in a world where|testament to)\b",
            re.IGNORECASE,
        ),
    ),
    Pattern(
        "ai_words",
        "Overused AI vocabulary",
        "Swap in a plain word with the exact meaning you need.",
        re.compile(
            r"\b(delved?|delving|showcas(?:e|ing|ed)|leverag(?:e|ing|ed)|"
            r"pivotal|crucial|captivat(?:e|ing)|tapestry|landscape|nestled|"
            r"breathtaking|vibrant|boasts?|seamless(?:ly)?|unlock(?:ing|ed)?|"
            r"elevat(?:e|ing|ed)|embark(?:ing|ed)?)\b",
            re.IGNORECASE,
        ),
    ),
    Pattern(
        "inflated_significance",
        "Inflated significance",
        "Keep the fact, drop the significance claim, end on the last concrete fact.",
        re.compile(
            r"\b(pivotal moment|game-?changer|revolutionar(?:y|ize)|cutting-?edge|"
            r"the future looks bright|continues? to thrive|marking a .* moment|"
            r"never been (?:easier|more important)|unforgettable|steal (?:my|the) heart)\b",
            re.IGNORECASE,
        ),
    ),
    Pattern(
        "vague_connection",
        "Vague connection",
        "State the actual relationship the source gives, or cut the phrase.",
        re.compile(
            r"\b(in connection with|associated with(?: the leadership of)?|"
            r"in the context of|plays? (?:a )?(?:vital|key|critical) role in)\b",
            re.IGNORECASE,
        ),
    ),
    Pattern(
        "ing_rider",
        "Shallow -ing rider",
        "Keep the rider only if the source supports it; otherwise end the sentence.",
        re.compile(
            r",\s+(?:symbolizing|reflecting|showcasing|highlighting|underscoring|capturing)\b[^.!?]*[.!?]",
            re.IGNORECASE,
        ),
    ),
    Pattern(
        "chatbot_residue",
        "Chatbot residue",
        "Remove the wrapper sentence and keep the content.",
        re.compile(
            r"\b(great question|i hope this helps|feel free to ask|let me know if|"
            r"as an ai|as a language model|sure thing|certainly!|absolutely!)\b",
            re.IGNORECASE,
        ),
    ),
    Pattern(
        "knowledge_disclaimer",
        "Knowledge-limit disclaimer or guess",
        "State what the source shows, or remove the sentence.",
        re.compile(
            r"\b(while details are limited|it appears that|it seems that|"
            r"based on (?:my|the) (?:training|knowledge)|as of my (?:knowledge|training)|"
            r"i don'?t have (?:real-time|access))\b",
            re.IGNORECASE,
        ),
    ),
    Pattern(
        "curly_quotes",
        "Curly quotation marks",
        "Use straight quotes unless your style guide says otherwise.",
        re.compile(r"[“”‘’]"),
    ),
    Pattern(
        "bold_decoration",
        "Bold used as decoration",
        "Remove the bold; turn labeled fragments into plain prose.",
        re.compile(r"\*\*[^*\n]{1,60}\*\*"),
    ),
    Pattern(
        "emoji_heading",
        "Emoji or arrow decoration",
        "Remove emojis and arrows from headings and body text.",
        re.compile(r"[\U0001F300-\U0001FAFF➔➜→←]"),
    ),
]

_EM_DASH = re.compile(r"—|--")
_SENTENCE_SPLIT = re.compile(r"(?<=[.!?])\s+")

FIX_OPERATIONS = {
    "straighten_quotes",
    "remove_decoration",
    "remove_staged_runup",
    "reduce_repeated_openings",
}
_SMART_QUOTES = str.maketrans({"“": '"', "”": '"', "‘": "'", "’": "'"})
_DECORATION_EMOJI = re.compile(r"[\U0001F300-\U0001FAFF\u2794\u279c\u2192\u2190]")
_BOLD_MARKERS = re.compile(r"\*\*([^*\n]{1,60})\*\*")
_STAGED_SENTENCE = re.compile(
    r"(?i)(?<!\w)(?:let's dive in|lets dive in|delve into|honestly\?|"
    r"in today's(?: fast-paced)? world|it is important to note|it's worth noting|"
    r"in conclusion|at the end of the day)(?:[.!?])?\s*"
)


def _tidy_fixed_text(text: str) -> str:
    text = re.sub(r"[ \t]{2,}", " ", text)
    text = re.sub(r"\s+([,.;!?])", r"\1", text)
    text = re.sub(r"([.!?])\s+(?=[.!?])", r"\1", text)
    return text.strip()


def _remove_repeated_openings(text: str) -> tuple[str, int]:
    sentences = _SENTENCE_SPLIT.split(text)
    changed = 0
    output: list[str] = []
    for sentence in sentences:
        if output:
            previous_words = output[-1].split()
            words = sentence.split()
            if len(previous_words) >= 4 and len(words) >= 4 and previous_words[0].lower() == words[0].lower():
                output[-1] = output[-1].rstrip(".!?") + " and " + sentence[:1].lower() + sentence[1:]
                changed += 1
                continue
        output.append(sentence)
    return _tidy_fixed_text(" ".join(output)), changed


def apply_fixes(text: str, ops: list[str]) -> dict:
    """Apply a small, deterministic set of meaning-preserving cleanups.

    The return value is suitable for a button preview: transformed text and one
    count per requested operation. Operations are ordered and idempotent.
    """
    unknown = [operation for operation in ops if operation not in FIX_OPERATIONS]
    if unknown:
        raise ValueError(f"unknown humanize operation: {unknown[0]}")

    result = text
    applied: list[dict[str, int | str]] = []
    for operation in ops:
        count = 0
        if operation == "straighten_quotes":
            count = sum(result.count(mark) for mark in ("“", "”", "‘", "’"))
            result = result.translate(_SMART_QUOTES)
        elif operation == "remove_decoration":
            result, bold_count = _BOLD_MARKERS.subn(r"\1", result)
            result, emoji_count = _DECORATION_EMOJI.subn("", result)
            count = bold_count + emoji_count
        elif operation == "remove_staged_runup":
            result, count = _STAGED_SENTENCE.subn("", result)
        elif operation == "reduce_repeated_openings":
            result, count = _remove_repeated_openings(result)
        result = _tidy_fixed_text(result)
        applied.append({"operation": operation, "count": count})
    return {"text": result, "operations": applied}


def _excerpt(text: str, start: int, end: int, width: int = 60) -> str:
    lo = max(0, start - width)
    hi = min(len(text), end + width)
    snippet = " ".join(text[lo:hi].split())
    return ("…" if lo > 0 else "") + snippet + ("…" if hi < len(text) else "")


def analyze(text: str) -> list[dict]:
    """Flag AI-sounding patterns; each finding keeps its source excerpt."""
    findings: list[dict] = []
    for pattern in _PATTERNS:
        hits = 0
        for match in pattern.regex.finditer(text):
            findings.append(
                {
                    "pattern": pattern.key,
                    "label": pattern.label,
                    "excerpt": _excerpt(text, match.start(), match.end()),
                    "suggestion": pattern.suggestion,
                }
            )
            hits += 1
            if hits >= pattern.max_hits:
                break
    findings.extend(_rhythm_findings(text))
    return findings


def _rhythm_findings(text: str) -> list[dict]:
    findings: list[dict] = []
    sentences = [s.strip() for s in _SENTENCE_SPLIT.split(text) if s.strip()]
    words = text.split()
    if words:
        dashes = len(_EM_DASH.findall(text))
        if dashes >= 3 and dashes / max(1, len(words)) > 0.01:
            findings.append(
                {
                    "pattern": "dash_connector",
                    "label": "Dashes as the universal connector",
                    "excerpt": f"{dashes} em-dashes in {len(words)} words",
                    "suggestion": "Use periods, commas, colons, or parentheses for most joins.",
                }
            )
    for first, second in zip(sentences, sentences[1:]):
        a = first.split()
        b = second.split()
        if len(a) >= 4 and len(b) >= 4 and a[0].lower() == b[0].lower():
            findings.append(
                {
                    "pattern": "repeated_opening",
                    "label": "Repeated sentence openings",
                    "excerpt": f"“{first[:60]}” / “{second[:60]}”",
                    "suggestion": "Merge the sentences or change the subject of one.",
                }
            )
            break
    return findings


def build_rewrite_prompt(text: str, voice_sample: str | None = None) -> str:
    voice = (
        f"\n\nVOICE SAMPLE (match its rhythm, word choice, and punctuation):\n{voice_sample}"
        if voice_sample
        else ""
    )
    return (
        "Rewrite the TEXT below so it reads like a person wrote it, without changing "
        "what it says. Rules: cut staged run-ups, not-X-but-Y contrasts, unraised "
        "objections, sayings, inflated significance, chatbot residue, and decorative "
        "formatting. Use plain words. Vary sentence rhythm; do not use em-dashes as "
        "the default connector. Never invent names, numbers, dates, quotes, or "
        "citations — if a sentence needs a missing detail, leave the sentence out. "
        "Output ONLY the rewritten text, no critique, no explanation."
        f"{voice}\n\nTEXT:\n{text}"
    )
