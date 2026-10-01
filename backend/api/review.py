"""Cross-notebook review: one queue across every notebook the user owns.

The dashboard's "start reviewing" button drills into this queue; grading
reuses the same scheduler as notebook-scoped review (core/study.py).
"""
from __future__ import annotations

from fastapi import Depends, FastAPI, HTTPException, Query

from api.deps import get_current_user, get_store, safe_id
from core.models import CardReview, Flashcard, QueuedCard, User, utcnow
from core import study as study_core


def register(app: FastAPI) -> None:
    @app.get("/api/me/review-queue", response_model=list[QueuedCard])
    def review_queue(
        limit: int = Query(default=50, ge=1, le=200),
        user: User = Depends(get_current_user),
    ):
        return get_store(app).list_due_cards_for_user(user.id, utcnow(), limit)

    @app.post("/api/me/cards/{card_id}/review", response_model=QueuedCard)
    def review_card(
        card_id: str, body: CardReview, user: User = Depends(get_current_user)
    ):
        card_id = safe_id(card_id, "card_id")
        store = get_store(app)
        queued = store.find_card_for_user(user.id, card_id)
        if queued is None:
            raise HTTPException(status_code=404, detail="card not found")
        card: Flashcard = queued.card
        study_core.schedule_review(card, body.rating, utcnow())
        store.save_card(card)
        store.mark_progress(user.id, "review")
        store.record_activity(user.id, "reviews")
        return queued
