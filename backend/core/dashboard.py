"""Pure dashboard math: study streaks and calendar day buckets.

No storage or framework imports — the routes assemble inputs from the store
and these functions do the date reasoning so it stays unit-testable.
"""
from __future__ import annotations

from datetime import date, timedelta

from core.models import (
    ActivityDay,
    Assignment,
    CalendarCardDue,
    CalendarDay,
    Streak,
)


def compute_streak(days: list[ActivityDay], today: str) -> Streak:
    """Current + longest study streak over days with at least one review.

    Today counts as reviewed only once a review actually happened today; a
    streak whose last review was yesterday stays alive (not yet broken) but
    does not include today.
    """
    review_days = {d.day for d in days if d.reviews > 0}
    if not review_days:
        return Streak(current=0, longest=0, reviewed_today=False)
    longest = _longest_run(review_days)
    cursor = date.fromisoformat(today)
    if today not in review_days:
        cursor -= timedelta(days=1)
    current = 0
    while cursor.isoformat() in review_days:
        current += 1
        cursor -= timedelta(days=1)
    return Streak(
        current=current, longest=max(longest, current),
        reviewed_today=today in review_days,
    )


def _longest_run(review_days: set[str]) -> int:
    best = 0
    for day in review_days:
        cursor = date.fromisoformat(day)
        if (cursor - timedelta(days=1)).isoformat() in review_days:
            continue  # mid-run day; only measure from run starts
        run = 1
        while (cursor + timedelta(days=run)).isoformat() in review_days:
            run += 1
        best = max(best, run)
    return best


def build_calendar_days(
    start_day: str,
    num_days: int,
    assignments: list[Assignment],
    card_due: list[tuple[str, CalendarCardDue]],
) -> list[CalendarDay]:
    """Assemble num_days CalendarDay buckets starting at start_day.

    Undated assignments have no bucket; card-due entries outside the horizon
    are dropped (the store folds overdue counts into today before calling).
    """
    start = date.fromisoformat(start_day)
    horizon = [(start + timedelta(days=o)).isoformat() for o in range(num_days)]
    buckets: dict[str, CalendarDay] = {day: CalendarDay(day=day) for day in horizon}
    for assignment in assignments:
        if assignment.due_at is None:
            continue
        day = assignment.due_at.date().isoformat()
        if day in buckets:
            buckets[day].assignments.append(assignment)
    for day, entry in card_due:
        if day in buckets:
            buckets[day].card_due.append(entry)
    return [buckets[day] for day in horizon]
