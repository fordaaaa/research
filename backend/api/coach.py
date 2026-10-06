"""Authenticated exam goals and persisted source-grounded revision practice."""
from __future__ import annotations

from collections.abc import Callable
from typing import TypeVar

from fastapi import Depends, FastAPI, HTTPException

from api.deps import get_current_user, get_store, notebook_or_404, safe_id
from core import coach
from core.models import CoachAttemptInput, CoachExplanation, CoachGenerationRequest, CoachSession, CoachStartRequest, CoachState, ExamGoal, User
from core.store import CoachConflict, Store

T = TypeVar("T")


def _result(action: Callable[[], T]) -> T:
    try:
        return action()
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="session or task not found") from exc
    except CoachConflict as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


def register(app: FastAPI) -> None:
    def owned(notebook_id: str, user: User) -> Store:
        safe_id(notebook_id, "notebook_id")
        store = get_store(app)
        notebook_or_404(store, user.id, notebook_id)
        return store

    @app.get("/api/notebooks/{notebook_id}/coach", response_model=CoachState)
    def state(notebook_id: str, user: User = Depends(get_current_user)) -> CoachState:
        return _result(lambda: owned(notebook_id, user).get_coach_state(user.id, notebook_id))

    @app.put("/api/notebooks/{notebook_id}/coach/goal", response_model=ExamGoal)
    def save_goal(notebook_id: str, body: ExamGoal, user: User = Depends(get_current_user)) -> ExamGoal:
        return _result(lambda: owned(notebook_id, user).save_exam_goal(user.id, notebook_id, body))

    @app.post("/api/notebooks/{notebook_id}/coach/sessions", response_model=CoachSession, status_code=201)
    def generate(notebook_id: str, body: CoachGenerationRequest, user: User = Depends(get_current_user)) -> CoachSession:
        store = owned(notebook_id, user)
        current = store.get_coach_state(user.id, notebook_id)
        if current.goal is None:
            raise HTTPException(status_code=400, detail="Set an exam goal before building a session")
        if any(item.status == "active" for item in current.sessions):
            raise HTTPException(status_code=409, detail="Finish your active session before building another")
        return _result(lambda: store.create_coach_session(user.id, coach.build_session(store, user.id, notebook_id, current.goal, body.use_ai)))

    @app.post("/api/notebooks/{notebook_id}/coach/sessions/{session_id}/start", response_model=CoachSession)
    def start(notebook_id: str, session_id: str, body: CoachStartRequest, user: User = Depends(get_current_user)) -> CoachSession:
        store = owned(notebook_id, user)
        safe_id(session_id, "session_id")
        return _result(lambda: store.update_coach_session(user.id, notebook_id, session_id, "start", task_ids=body.task_ids))

    @app.post("/api/notebooks/{notebook_id}/coach/sessions/{session_id}/attempts", response_model=CoachSession)
    def attempt(notebook_id: str, session_id: str, body: CoachAttemptInput, user: User = Depends(get_current_user)) -> CoachSession:
        store = owned(notebook_id, user)
        safe_id(session_id, "session_id")
        return _result(lambda: store.update_coach_session(user.id, notebook_id, session_id, "attempt", attempt=body))

    @app.post("/api/notebooks/{notebook_id}/coach/sessions/{session_id}/finish", response_model=CoachSession)
    def finish(notebook_id: str, session_id: str, user: User = Depends(get_current_user)) -> CoachSession:
        store = owned(notebook_id, user)
        safe_id(session_id, "session_id")
        return _result(lambda: store.update_coach_session(user.id, notebook_id, session_id, "finish"))

    @app.post("/api/notebooks/{notebook_id}/coach/sessions/{session_id}/tasks/{task_id}/explain", response_model=CoachExplanation)
    def explain(notebook_id: str, session_id: str, task_id: str, body: CoachGenerationRequest, user: User = Depends(get_current_user)) -> CoachExplanation:
        store = owned(notebook_id, user)
        safe_id(session_id, "session_id")
        safe_id(task_id, "task_id")
        session = _result(lambda: store.get_coach_session(user.id, notebook_id, session_id))
        task = next((task for task in session.tasks if task.id == task_id), None)
        if task is None:
            raise HTTPException(status_code=404, detail="task not found")
        return coach.explain_task(store, user.id, notebook_id, task, body.use_ai)
