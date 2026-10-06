import { apiFetch, BASE, j } from "./client";
import type { CoachAttemptInput, CoachExplanation, CoachSession, CoachState, ExamGoal } from "./types";

const path = (notebookId: string) => `${BASE}/notebooks/${notebookId}/coach`;
function write<T>(url: string, body: unknown, signal?: AbortSignal, method = "POST") {
  return apiFetch(url, { method, signal, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then(j<T>);
}
export const getCoachState = (notebookId: string, signal?: AbortSignal) =>
  apiFetch(path(notebookId), { signal }).then(j<CoachState>);
export const saveExamGoal = (notebookId: string, goal: ExamGoal, signal?: AbortSignal) =>
  write<ExamGoal>(`${path(notebookId)}/goal`, goal, signal, "PUT");
export const buildCoachSession = (notebookId: string, useAi: boolean, signal?: AbortSignal) =>
  write<CoachSession>(`${path(notebookId)}/sessions`, { use_ai: useAi }, signal);
export const startCoachSession = (notebookId: string, sessionId: string, taskIds: string[], signal?: AbortSignal) =>
  write<CoachSession>(`${path(notebookId)}/sessions/${sessionId}/start`, { task_ids: taskIds }, signal);
export const recordCoachAttempt = (notebookId: string, sessionId: string, attempt: CoachAttemptInput, signal?: AbortSignal) =>
  write<CoachSession>(`${path(notebookId)}/sessions/${sessionId}/attempts`, attempt, signal);
export const finishCoachSession = (notebookId: string, sessionId: string, signal?: AbortSignal) =>
  write<CoachSession>(`${path(notebookId)}/sessions/${sessionId}/finish`, {}, signal);
export const explainCoachTask = (notebookId: string, sessionId: string, taskId: string, useAi: boolean, signal?: AbortSignal) =>
  write<CoachExplanation>(`${path(notebookId)}/sessions/${sessionId}/tasks/${taskId}/explain`, { use_ai: useAi }, signal);
