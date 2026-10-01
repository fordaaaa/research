import { apiFetch, j, jVoid, BASE } from "./client";
import type { Skill } from "./types";

export const listSkills = () => apiFetch(`${BASE}/skills`).then(j<Skill[]>);

export const createSkill = (body: { name: string; instructions: string; triggers: string[] }) =>
  apiFetch(`${BASE}/skills`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }).then(j<Skill>);

export const deleteSkill = (id: string) =>
  apiFetch(`${BASE}/skills/${id}`, { method: "DELETE" }).then(jVoid);

export const getMemory = (notebookId: string) =>
  apiFetch(`${BASE}/notebooks/${notebookId}/memory`).then(j<{ notes: string }>);

export const saveMemory = (notebookId: string, notes: string) =>
  apiFetch(`${BASE}/notebooks/${notebookId}/memory`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ notes }),
  }).then(j<{ notes: string }>);
