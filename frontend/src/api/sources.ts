import { apiFetch, j, jVoid, BASE, clearToken, parseRetryAfter, RateLimitError, detailMessage } from "./client";
import type { AddPasteOptions, AddSourceResult, DuplicateRef, SourceDetail, SourceSummary, UploadError } from "./types";

export const listSources = (notebookId: string) =>
  apiFetch(`${BASE}/notebooks/${notebookId}/sources`).then(j<SourceSummary[]>);

export const uploadFiles = (notebookId: string, files: File[]) => {
  const form = new FormData();
  files.forEach((f) => form.append("files", f));
  return apiFetch(`${BASE}/notebooks/${notebookId}/sources`, {
    method: "POST",
    body: form,
  }).then(j<{ sources: SourceSummary[]; errors: UploadError[] }>);
};

function isDuplicateRef(value: unknown): value is DuplicateRef {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return typeof candidate.id === "string" && typeof candidate.title === "string";
}

function pickDuplicateOf(payload: unknown): DuplicateRef | null {
  if (typeof payload !== "object" || payload === null) return null;
  const duplicate = (payload as Record<string, unknown>).duplicate_of;
  return isDuplicateRef(duplicate) ? duplicate : null;
}

export const addPaste = async (
  notebookId: string,
  title: string,
  text: string,
  opts?: AddPasteOptions,
): Promise<AddSourceResult> => {
  const res = await apiFetch(`${BASE}/notebooks/${notebookId}/sources/text`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(opts?.force ? { title, text, force: true } : { title, text }),
  });
  if (res.status === 401) {
    clearToken();
    window.dispatchEvent(new Event("research:unauthorized"));
    throw new Error("login required");
  }
  if (res.status === 429) throw new RateLimitError(parseRetryAfter(res));
  if (!res.ok) {
    const body = await res.json().catch(() => null) as unknown;
    throw new Error(detailMessage(body, `${res.status} ${res.statusText}`));
  }
  // Old backends return an empty body: treat as a normal save with no hint.
  const payload = await res.json().catch(() => null) as unknown;
  const duplicate = pickDuplicateOf(payload);
  // New contract carries saved:false on HTTP 200 (nothing persisted).
  // Fall back to the status code when the field is absent: 201 means the
  // legacy backend already saved (warn-after-save path).
  const rawSaved =
    typeof payload === "object" && payload !== null
      ? (payload as Record<string, unknown>).saved
      : undefined;
  const saved = typeof rawSaved === "boolean" ? rawSaved : res.status !== 200;
  if (saved && !duplicate) return { saved };
  return { saved, ...(duplicate ? { duplicate_of: duplicate } : {}) };
};

export const addUrl = (notebookId: string, url: string, opts?: AddPasteOptions) =>
  apiFetch(`${BASE}/notebooks/${notebookId}/sources/url`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(opts?.force ? { url, force: true } : { url }),
  }).then(j<SourceSummary & AddSourceResult>);

export const getSource = (id: string) =>
  apiFetch(`${BASE}/sources/${id}`).then(j<SourceDetail>);

export const deleteSource = (id: string) =>
  apiFetch(`${BASE}/sources/${id}`, { method: "DELETE" }).then(jVoid);
