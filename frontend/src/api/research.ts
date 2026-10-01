import { apiFetch, j, BASE } from "./client";
import type { ResearchGather, ResearchPlan, ResearchSynthesis } from "./types";

export const planResearch = (notebookId: string, topic: string) =>
  apiFetch(`${BASE}/notebooks/${notebookId}/research/plan`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ topic }),
  }).then(j<ResearchPlan>);

export const gatherResearch = (notebookId: string, queries: string[]) =>
  apiFetch(`${BASE}/notebooks/${notebookId}/research/gather`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ queries }),
  }).then(j<ResearchGather>);

export const synthesizeResearch = (notebookId: string, body: { topic: string; queries: string[] }) =>
  apiFetch(`${BASE}/notebooks/${notebookId}/research/synthesize`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }).then(j<ResearchSynthesis>);
