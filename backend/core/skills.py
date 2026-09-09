"""Local skills library and notebook memory, Hermes-inspired but keyless.

A skill is a named bundle of instructions with trigger phrases. Matching is a
deterministic substring check that works with no provider; matched skills are
prepended to AI prompts only when the user configured a key, and are silently
ignored otherwise. Notebook memory is free-form user context with the same rule.
"""
from __future__ import annotations

from core.models import Skill

MAX_MATCHED_SKILLS = 3


def match_skills(skills: list[Skill], text: str) -> list[Skill]:
    """Return up to 3 skills whose trigger phrase appears in the text."""
    lowered = text.lower()
    matched = [
        skill for skill in skills
        if any(trigger.lower() in lowered for trigger in skill.triggers)
    ]
    return matched[:MAX_MATCHED_SKILLS]


def skills_section(skills: list[Skill]) -> str:
    lines = ["SAVED SKILLS (follow instructions whose triggers matched):"]
    for skill in skills:
        lines.append(f"- {skill.name}: {skill.instructions}")
    return "\n".join(lines)


def memory_section(notes: str) -> str:
    return f"NOTEBOOK NOTES (your own context, treat as background):\n{notes}"
