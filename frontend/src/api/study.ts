import { apiFetch, j, jVoid, BASE, fetchDownload, downloadFile } from "./client";
import type { CardSuggestion, CardUpdate, DownloadedFile, Flashcard, GlossaryEntry, MindmapNode, QuizQuestion, ReviewRating, SourceSummary } from "./types";

export const listCards = (notebookId: string) =>
  apiFetch(`${BASE}/notebooks/${notebookId}/cards`).then(j<Flashcard[]>);

export const createCard = (
  notebookId: string,
  body: { front: string; back: string; tags?: string[] }
) =>
  apiFetch(`${BASE}/notebooks/${notebookId}/cards`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }).then(j<Flashcard>);

export const updateCard = (notebookId: string, cardId: string, body: CardUpdate) =>
  apiFetch(`${BASE}/notebooks/${notebookId}/cards/${cardId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }).then(j<Flashcard>);

export const listDueCards = (notebookId: string, limit = 20) =>
  apiFetch(`${BASE}/notebooks/${notebookId}/cards/review?limit=${limit}`).then(
    j<Flashcard[]>
  );

export const reviewCard = (notebookId: string, cardId: string, rating: ReviewRating) =>
  apiFetch(`${BASE}/notebooks/${notebookId}/cards/${cardId}/review`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ rating }),
  }).then(j<Flashcard>);

export const listCardSuggestions = (notebookId: string, limit = 5) =>
  apiFetch(`${BASE}/notebooks/${notebookId}/cards/suggestions?limit=${limit}`).then(
    j<CardSuggestion[]>
  );

export const deleteCard = (notebookId: string, cardId: string) =>
  apiFetch(`${BASE}/notebooks/${notebookId}/cards/${cardId}`, { method: "DELETE" }).then(jVoid);

export const listGlossary = (notebookId: string, limit = 20) =>
  apiFetch(`${BASE}/notebooks/${notebookId}/glossary?limit=${limit}`).then(
    j<GlossaryEntry[]>
  );

export const listQuiz = (notebookId: string, limit = 10) =>
  apiFetch(`${BASE}/notebooks/${notebookId}/quiz?limit=${limit}`).then(
    j<QuizQuestion[]>
  );

export const exportCardsUrl = (notebookId: string) => `${BASE}/notebooks/${notebookId}/cards/export`;

// Prefer downloadCards() over the plain exportCardsUrl anchor, which cannot
// send the bearer token and fails with 401 when login is required.
export async function fetchCardsExport(notebookId: string): Promise<DownloadedFile> {
  return fetchDownload(`${BASE}/notebooks/${notebookId}/cards/export`, `notebook-${notebookId}-flashcards.tsv`);
}

export async function downloadCards(notebookId: string): Promise<DownloadedFile> {
  return downloadFile(`${BASE}/notebooks/${notebookId}/cards/export`, `notebook-${notebookId}-flashcards.tsv`);
}

export const getGuide = (notebookId: string) =>
  apiFetch(`${BASE}/notebooks/${notebookId}/guide`).then(j<{ markdown: string }>);

export const saveGuide = (notebookId: string) =>
  apiFetch(`${BASE}/notebooks/${notebookId}/guide`, { method: "POST" }).then(j<{ source: SourceSummary }>);

export const getMindmap = (notebookId: string) =>
  apiFetch(`${BASE}/notebooks/${notebookId}/mindmap`).then(j<MindmapNode>);

export const exportMindmapUrl = (notebookId: string) => `${BASE}/notebooks/${notebookId}/mindmap/export`;

// Prefer downloadMindmap() over the plain exportMindmapUrl anchor, which
// cannot send the bearer token and fails with 401 when login is required.
export async function fetchMindmapExport(notebookId: string): Promise<DownloadedFile> {
  return fetchDownload(
    `${BASE}/notebooks/${notebookId}/mindmap/export`,
    `notebook-${notebookId}-mindmap.md`
  );
}

export async function downloadMindmap(notebookId: string): Promise<DownloadedFile> {
  return downloadFile(`${BASE}/notebooks/${notebookId}/mindmap/export`, `notebook-${notebookId}-mindmap.md`);
}
