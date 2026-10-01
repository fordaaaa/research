import { apiFetch, j, BASE } from "./client";
import type { HumanizeAnalysis, HumanizeFix, HumanizeFixOperation, HumanizeRewrite } from "./types";

export const analyzeHumanize = (text: string) =>
  apiFetch(`${BASE}/humanize/analyze`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  }).then(j<HumanizeAnalysis>);

export const fixHumanize = (text: string, operations: HumanizeFixOperation[]) =>
  apiFetch(`${BASE}/humanize/fix`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, operations }),
  }).then(j<HumanizeFix>);

export const rewriteHumanize = (text: string, voiceSample?: string) =>
  apiFetch(`${BASE}/humanize/rewrite`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(voiceSample ? { text, voice_sample: voiceSample } : { text }),
  }).then(j<HumanizeRewrite>);
