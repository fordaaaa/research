import { apiFetch, j, jVoid, BASE } from "./client";
import type { Note, NoteCitation, NoteSummary, NoteUpdate } from "./types";

export class NoteConflictError extends Error {
  current: Note;

  constructor(current: Note) {
    super("This note changed in another editor.");
    this.name = "NoteConflictError";
    this.current = current;
  }
}

export const listNotes = (notebookId: string) =>
  apiFetch(`${BASE}/notebooks/${notebookId}/notes`).then(j<NoteSummary[]>);

export const createNote = (notebookId: string, body: { title: string; body: string; citations?: NoteCitation[] }) =>
  apiFetch(`${BASE}/notebooks/${notebookId}/notes`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }).then(j<Note>);

export const getNote = (notebookId: string, noteId: string) =>
  apiFetch(`${BASE}/notebooks/${notebookId}/notes/${noteId}`).then(j<Note>);

export async function updateNote(notebookId: string, noteId: string, body: NoteUpdate): Promise<Note> {
  const response = await apiFetch(`${BASE}/notebooks/${notebookId}/notes/${noteId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (response.status === 409) {
    const payload = await response.json() as { detail?: { current?: Note } };
    if (payload.detail?.current) throw new NoteConflictError(payload.detail.current);
  }
  return j<Note>(response);
}

export const deleteNote = (notebookId: string, noteId: string) =>
  apiFetch(`${BASE}/notebooks/${notebookId}/notes/${noteId}`, { method: "DELETE" }).then(jVoid);
