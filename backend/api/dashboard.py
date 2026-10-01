"""The user dashboard: one fetch powering the home surface.

Aggregates due flashcards, the study streak, calendar buckets, and recent
activity. Pure math lives in core/dashboard.py; queries live in the store.
"""
from __future__ import annotations

from datetime import timedelta

from fastapi import Depends, FastAPI, Query

from api.deps import get_current_user, get_store
from core.dashboard import build_calendar_days, compute_streak
from core.models import DashboardSummary, User, utcnow


def register(app: FastAPI) -> None:
    @app.get("/api/me/dashboard", response_model=DashboardSummary)
    def dashboard(
        days: int = Query(default=35, ge=7, le=62),
        user: User = Depends(get_current_user),
    ) -> DashboardSummary:
        store = get_store(app)
        moment = utcnow()
        today = moment.date().isoformat()
        streak = compute_streak(
            store.list_activity_days(user.id, since_day=(moment - timedelta(days=400)).date().isoformat()),
            today,
        )
        horizon_end = moment + timedelta(days=days)
        assignments = store.list_assignments(user.id, since=moment, until=horizon_end)
        card_due = store.due_by_day(user.id, today, days)
        due_by_notebook = store.due_counts_by_notebook(user.id, moment)
        return DashboardSummary(
            due_total=sum(entry.due for entry in due_by_notebook),
            due_by_notebook=due_by_notebook,
            streak=streak,
            calendar=build_calendar_days(today, days, assignments, card_due),
            recent_notes=store.recent_notes(user.id, limit=5),
            recent_sources=store.recent_sources(user.id, limit=5),
            classes=store.list_classes(user.id),
        )
