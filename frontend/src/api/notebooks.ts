import { apiFetch, j, jVoid, BASE, fetchDownload, downloadFile } from "./client";
import type { Notebook, NotebookExport } from "./types";

export const listNotebooks = () => apiFetch(`${BASE}/notebooks`).then(j<Notebook[]>);

export const createNotebook = (name: string) =>
  apiFetch(`${BASE}/notebooks`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  }).then(j<Notebook>);

export const deleteNotebook = (id: string) =>
  apiFetch(`${BASE}/notebooks/${id}`, { method: "DELETE" }).then(jVoid);

export const exportNotebookUrl = (id: string) => `${BASE}/notebooks/${id}/export`;

export async function fetchNotebookExport(id: string): Promise<NotebookExport> {
  return fetchDownload(`${BASE}/notebooks/${id}/export`, `notebook-${id}.zip`);
}

export async function downloadNotebook(id: string): Promise<NotebookExport> {
  return downloadFile(`${BASE}/notebooks/${id}/export`, `notebook-${id}.zip`);
}

export const createDemo = () =>
  apiFetch(`${BASE}/demo`, { method: "POST" }).then(j<Notebook>);
