import { apiFetch, j, jVoid, BASE } from "./client";
import type { OutlineDeep, OutlineDraft, OutlineField, OutlineItem, OutlineReport, ResearchOutline } from "./types";

export const listOutlines = (notebookId: string) =>
  apiFetch(`${BASE}/notebooks/${notebookId}/outlines`).then(j<ResearchOutline[]>);

export const createOutline = (notebookId: string, body: { topic: string; items: { label: string }[]; fields: { label: string }[] }) =>
  apiFetch(`${BASE}/notebooks/${notebookId}/outlines`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }).then(j<ResearchOutline>);

export const updateOutline = (notebookId: string, outlineId: string, body: { topic?: string; items?: OutlineItem[]; fields?: OutlineField[] }) =>
  apiFetch(`${BASE}/notebooks/${notebookId}/outlines/${outlineId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }).then(j<ResearchOutline>);

export const deleteOutline = (notebookId: string, outlineId: string) =>
  apiFetch(`${BASE}/notebooks/${notebookId}/outlines/${outlineId}`, { method: "DELETE" }).then(jVoid);

export const draftOutline = (notebookId: string, topic: string) =>
  apiFetch(`${BASE}/notebooks/${notebookId}/outlines/draft`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ topic }),
  }).then(j<OutlineDraft>);

export const deepOutline = (notebookId: string, outlineId: string, perItem = 4) =>
  apiFetch(`${BASE}/notebooks/${notebookId}/outlines/${outlineId}/deep`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ per_item: perItem }),
  }).then(j<OutlineDeep>);

export const reportOutline = (notebookId: string, outlineId: string) =>
  apiFetch(`${BASE}/notebooks/${notebookId}/outlines/${outlineId}/report`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  }).then(j<OutlineReport>);
