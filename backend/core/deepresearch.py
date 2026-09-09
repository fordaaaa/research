"""Deep-research outline helpers: draft angles, per-item queries, report text.

Keyless by design: every helper is deterministic and works with no provider.
AI only upgrades the wording when the caller supplies it.
"""
from __future__ import annotations

from core import research
from core.models import OutlineField, OutlineItem, Source

DEFAULT_FIELDS = [
    "Overview",
    "Key facts",
    "Criticism and limitations",
    "Recent developments",
]

MAX_DRAFT_ITEMS = 8


def draft_heuristic(topic: str) -> tuple[list[str], list[str]]:
    """Starter outline angles for a topic; the user edits them before research."""
    items = research.plan_queries(topic)[: research.MAX_PLAN_QUERIES]
    return items, list(DEFAULT_FIELDS)


def build_draft_prompt(topic: str) -> str:
    return (
        "You plan deep research. Given the TOPIC, output two sections with these "
        "exact headers:\nITEMS:\nFIELDS:\nUnder ITEMS list 8 to 12 concrete things "
        "to investigate (names, products, papers, events — one per line, each under "
        "60 characters). Under FIELDS list 4 to 6 aspects to record for every item "
        "(e.g. release date, pricing). No numbering, no quotes, no explanation, "
        "no extra sections.\n\n"
        f"TOPIC: {topic}"
    )


def parse_draft(answer: str) -> tuple[list[str], list[str]]:
    """Split a model answer into (items, fields); ([], []) if unusable."""
    items: list[str] = []
    fields: list[str] = []
    section: str | None = None
    seen: set[str] = set()
    for raw_line in answer.splitlines():
        line = research._BULLET.sub("", raw_line.strip()).strip("\"'").strip()  # noqa: SLF001
        if not line:
            continue
        lowered = line.lower().rstrip(":")
        if lowered in ("items", "research items"):
            section = "items"
            continue
        if lowered in ("fields", "research fields"):
            section = "fields"
            continue
        if len(line) < 2 or len(line) > 120 or "http" in line.lower() or line.endswith(":"):
            continue
        if research._REFUSAL.match(line):  # noqa: SLF001
            continue
        key = line.lower()
        if key in seen:
            continue
        seen.add(key)
        if section == "fields":
            fields.append(line)
        else:
            items.append(line)
    return items[:12], fields[:6]


def item_queries(
    topic: str, item: OutlineItem, fields: list[OutlineField], per_item: int = 4
) -> list[str]:
    """Deterministic sub-queries for one outline item; works with no key."""
    queries: list[str] = [item.label, f"{item.label} {topic}"]
    queries.extend(f"{item.label} {field.label.lower()}" for field in fields[:2])
    seen: set[str] = set()
    out: list[str] = []
    for query in queries:
        key = query.lower()
        if key not in seen:
            seen.add(key)
            out.append(query)
    return out[: max(1, per_item)]


def build_report_digest(
    topic: str, items: list[OutlineItem], fields: list[OutlineField], sources: list[Source]
) -> str:
    """Keyless markdown report: outline matrix, then numbered source excerpts."""
    lines = [f"# Research report: {topic}", ""]
    if items:
        lines.append("## Outline")
        for item in items:
            lines.append(f"- {item.label}")
        lines.append("")
    if fields:
        lines.append("## Fields collected per item")
        lines.extend(f"- {field.label}" for field in fields)
        lines.append("")
    lines.append(research.build_digest(topic, [], sources))
    return "\n".join(lines).rstrip()


def build_report_prompt(topic: str, items: list[OutlineItem], excerpts: list[str]) -> str:
    item_list = "\n".join(f"- {item.label}" for item in items)
    return (
        "Write a markdown research report on the TOPIC covering each outline item "
        "with its own section. Sections: a short summary, one section per item "
        "(bulleted findings), open questions or disagreements. Use only the numbered "
        "excerpts below and cite every claim with a marker like [1] matching the "
        "excerpt number. If the excerpts do not cover something, say so.\n\n"
        f"TOPIC: {topic}\n\nOUTLINE ITEMS:\n{item_list}\n\n"
        "EXCERPTS:\n" + "\n\n".join(excerpts)
    )
