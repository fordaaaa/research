"""Classes and assignments: the student's calendar layer.

User-scoped (not notebook-scoped): a class exists outside any notebook, and
an assignment may optionally link to one. Google Classroom sync reuses this
table with source='google_classroom' (see api/classroom.py).
"""
from __future__ import annotations

from datetime import timedelta

from fastapi import Depends, FastAPI, HTTPException, Query

from api.deps import get_current_user, get_store, safe_id
from core.dashboard import build_calendar_days
from core.models import (
    Assignment,
    AssignmentCreate,
    AssignmentUpdate,
    CalendarDay,
    StudyClass,
    StudyClassCreate,
    StudyClassUpdate,
    User,
    utcnow,
)


def register(app: FastAPI) -> None:
    @app.post("/api/classes", response_model=StudyClass, status_code=201)
    def create_class(body: StudyClassCreate, user: User = Depends(get_current_user)):
        return get_store(app).create_class(user.id, body.name.strip(), body.color)

    @app.get("/api/classes", response_model=list[StudyClass])
    def list_classes(user: User = Depends(get_current_user)):
        return get_store(app).list_classes(user.id)

    @app.get("/api/classes/{class_id}", response_model=StudyClass)
    def get_class(class_id: str, user: User = Depends(get_current_user)):
        class_id = safe_id(class_id, "class_id")
        klass = get_store(app).get_class(user.id, class_id)
        if klass is None:
            raise HTTPException(status_code=404, detail="class not found")
        return klass

    @app.patch("/api/classes/{class_id}", response_model=StudyClass)
    def update_class(
        class_id: str, body: StudyClassUpdate, user: User = Depends(get_current_user)
    ):
        class_id = safe_id(class_id, "class_id")
        updated = get_store(app).update_class(
            user.id, class_id, body.name.strip() if body.name else None, body.color
        )
        if updated is None:
            raise HTTPException(status_code=404, detail="class not found")
        return updated

    @app.delete("/api/classes/{class_id}", status_code=204)
    def delete_class(class_id: str, user: User = Depends(get_current_user)):
        class_id = safe_id(class_id, "class_id")
        if not get_store(app).delete_class(user.id, class_id):
            raise HTTPException(status_code=404, detail="class not found")

    @app.post("/api/assignments", response_model=Assignment, status_code=201)
    def create_assignment(
        body: AssignmentCreate, user: User = Depends(get_current_user)
    ):
        store = get_store(app)
        if body.class_id is not None:
            body.class_id = safe_id(body.class_id, "class_id")
            if store.get_class(user.id, body.class_id) is None:
                raise HTTPException(status_code=404, detail="class not found")
        if body.notebook_id is not None:
            body.notebook_id = safe_id(body.notebook_id, "notebook_id")
        assignment = store.create_assignment(
            user.id, body.title.strip(), body.due_at,
            class_id=body.class_id, details=body.details, notebook_id=body.notebook_id,
        )
        return assignment

    @app.get("/api/assignments", response_model=list[Assignment])
    def list_assignments(user: User = Depends(get_current_user)):
        return get_store(app).list_assignments(user.id)

    @app.patch("/api/assignments/{assignment_id}", response_model=Assignment)
    def update_assignment(
        assignment_id: str,
        body: AssignmentUpdate,
        user: User = Depends(get_current_user),
    ):
        assignment_id = safe_id(assignment_id, "assignment_id")
        if body.class_id:
            body.class_id = safe_id(body.class_id, "class_id")
            if get_store(app).get_class(user.id, body.class_id) is None:
                raise HTTPException(status_code=404, detail="class not found")
        if body.notebook_id:
            body.notebook_id = safe_id(body.notebook_id, "notebook_id")
        updated = get_store(app).update_assignment(
            user.id, assignment_id, body.model_dump(exclude_unset=True)
        )
        if updated is None:
            raise HTTPException(status_code=404, detail="assignment not found")
        return updated

    @app.delete("/api/assignments/{assignment_id}", status_code=204)
    def delete_assignment(
        assignment_id: str, user: User = Depends(get_current_user)
    ):
        assignment_id = safe_id(assignment_id, "assignment_id")
        if not get_store(app).delete_assignment(user.id, assignment_id):
            raise HTTPException(status_code=404, detail="assignment not found")

    @app.get("/api/me/calendar", response_model=list[CalendarDay])
    def calendar(
        days: int = Query(default=35, ge=7, le=62),
        user: User = Depends(get_current_user),
    ):
        store = get_store(app)
        moment = utcnow()
        today = moment.date().isoformat()
        horizon_end = moment + timedelta(days=days)
        assignments = store.list_assignments(user.id, since=moment, until=horizon_end)
        card_due = store.due_by_day(user.id, today, days)
        return build_calendar_days(today, days, assignments, card_due)
