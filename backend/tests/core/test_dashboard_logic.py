"""Pure dashboard math: streak computation and calendar day assembly."""
from datetime import datetime, timezone

import pytest

from core.dashboard import build_calendar_days, compute_streak
from core.models import ActivityDay, Assignment, CalendarCardDue


def _days(*pairs: tuple[str, int]) -> list[ActivityDay]:
    return [ActivityDay(day=day, reviews=count) for day, count in pairs]


def test_streak_empty_history_is_zero():
    streak = compute_streak([], today="2026-09-30")
    assert streak.current == 0
    assert streak.longest == 0
    assert streak.reviewed_today is False


def test_streak_counts_today_and_yesterday():
    days = _days(("2026-09-29", 3), ("2026-09-30", 1))
    streak = compute_streak(days, today="2026-09-30")
    assert streak.current == 2
    assert streak.reviewed_today is True


def test_streak_stays_alive_when_today_not_yet_reviewed():
    days = _days(("2026-09-27", 1), ("2026-09-28", 2), ("2026-09-29", 4))
    streak = compute_streak(days, today="2026-09-30")
    assert streak.current == 3
    assert streak.reviewed_today is False


def test_streak_breaks_on_gap():
    days = _days(("2026-09-26", 1), ("2026-09-27", 1), ("2026-09-29", 1), ("2026-09-30", 1))
    streak = compute_streak(days, today="2026-09-30")
    assert streak.current == 2
    assert streak.longest == 2


def test_streak_longest_exceeds_current():
    days = _days(
        ("2026-08-01", 1), ("2026-08-02", 1), ("2026-08-03", 1), ("2026-08-04", 1),
        ("2026-09-29", 1),
    )
    streak = compute_streak(days, today="2026-09-30")
    assert streak.current == 1
    assert streak.longest == 4


def test_streak_ignores_days_with_only_adds():
    days = [ActivityDay(day="2026-09-29", reviews=0, sources=5)]
    streak = compute_streak(days, today="2026-09-30")
    assert streak.current == 0


def test_calendar_buckets_assignments_and_cards_by_day():
    assignments = [
        Assignment(
            id="a1", class_id=None, title="Lab report",
            due_at=datetime(2026, 10, 2, 23, 59, tzinfo=timezone.utc),
            created_at=datetime(2026, 9, 30, tzinfo=timezone.utc),
            updated_at=datetime(2026, 9, 30, tzinfo=timezone.utc),
        ),
        Assignment(
            id="a2", class_id=None, title="Undated essay", due_at=None,
            created_at=datetime(2026, 9, 30, tzinfo=timezone.utc),
            updated_at=datetime(2026, 9, 30, tzinfo=timezone.utc),
        ),
    ]
    card_due = [
        ("2026-10-01", CalendarCardDue(notebook_id="nb1", notebook_name="Bio", count=4)),
        ("2026-09-01", CalendarCardDue(notebook_id="nb1", notebook_name="Bio", count=99)),
    ]
    days = build_calendar_days("2026-09-30", 5, assignments, card_due)
    assert [d.day for d in days] == [
        "2026-09-30", "2026-10-01", "2026-10-02", "2026-10-03", "2026-10-04",
    ]
    assert days[0].assignments == []
    assert [a.id for a in days[2].assignments] == ["a1"]  # undated assignment dropped
    assert [c.count for c in days[1].card_due] == [4]
    # the overdue 2026-09-01 bucket is outside the horizon and must not appear
    assert all("2026-09-01" != d.day for d in days)
