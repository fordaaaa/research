import { apiFetch, j, jVoid, BASE } from "./client";
import type { Assignment, CalendarDay, DashboardSummary, NewAssignment, QueuedCard, ReviewRating, StudyClass } from "./types";

export const getDashboard = () =>
  apiFetch(`${BASE}/me/dashboard`).then(j<DashboardSummary>);

export const listClasses = () => apiFetch(`${BASE}/classes`).then(j<StudyClass[]>);

export const createClass = (name: string, color: string) =>
  apiFetch(`${BASE}/classes`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, color }),
  }).then(j<StudyClass>);

export const updateClass = (id: string, fields: { name?: string; color?: string }) =>
  apiFetch(`${BASE}/classes/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(fields),
  }).then(j<StudyClass>);

export const deleteClass = (id: string) =>
  apiFetch(`${BASE}/classes/${id}`, { method: "DELETE" }).then(jVoid);

export const listAssignments = () =>
  apiFetch(`${BASE}/assignments`).then(j<Assignment[]>);

export const createAssignment = (body: NewAssignment) =>
  apiFetch(`${BASE}/assignments`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }).then(j<Assignment>);

export const updateAssignment = (
  id: string,
  fields: { title?: string; done?: boolean; due_at?: string | null; class_id?: string | null; notebook_id?: string | null }
) =>
  apiFetch(`${BASE}/assignments/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(fields),
  }).then(j<Assignment>);

export const deleteAssignment = (id: string) =>
  apiFetch(`${BASE}/assignments/${id}`, { method: "DELETE" }).then(jVoid);

export const getCalendar = (days = 35) =>
  apiFetch(`${BASE}/me/calendar?days=${days}`).then(j<CalendarDay[]>);

export const getUserReviewQueue = (limit = 50) =>
  apiFetch(`${BASE}/me/review-queue?limit=${limit}`).then(j<QueuedCard[]>);

export const reviewUserCard = (cardId: string, rating: ReviewRating) =>
  apiFetch(`${BASE}/me/cards/${cardId}/review`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ rating }),
  }).then(j<QueuedCard>);
