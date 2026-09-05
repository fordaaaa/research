export interface Notebook {
  id: string;
  name: string;
  created_at: string;
}

export interface SourceSummary {
  id: string;
  notebook_id: string;
  kind: "pdf" | "docx" | "txt" | "md" | "paste" | "url";
  title: string;
  tags: string[];
  meta: { page_count?: number; word_count?: number } & Record<string, unknown>;
  created_at: string;
  chunk_count: number;
}

export interface SearchHit {
  source_id: string;
  source_title: string;
  pages: number[];
  score: number;
  snippet: string;
  matched_terms: string[];
}

export interface WebSearchResult {
  title: string;
  url: string;
  snippet: string;
}

export interface AISettings {
  configured: boolean;
  provider: "gemini" | null;
  model: string | null;
}

export interface Citation {
  source_id: string;
  source_title: string;
  pages: number[];
}

export interface ChatResponse {
  answer: string;
  citations: Citation[];
}

export interface UploadError {
  file: string;
  detail: string;
}

async function j<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => null) as { detail?: string } | null;
    throw new Error(body?.detail || `${res.status} ${res.statusText}`);
  }
  return res.json() as Promise<T>;
}

const BASE = "/api";

export const listNotebooks = () => fetch(`${BASE}/notebooks`).then(j<Notebook[]>);

export const createNotebook = (name: string) =>
  fetch(`${BASE}/notebooks`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  }).then(j<Notebook>);

export const deleteNotebook = (id: string) =>
  fetch(`${BASE}/notebooks/${id}`, { method: "DELETE" }).then((r) => {
    if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
  });

export const listSources = (notebookId: string) =>
  fetch(`${BASE}/notebooks/${notebookId}/sources`).then(j<SourceSummary[]>);

export const uploadFiles = (notebookId: string, files: File[]) => {
  const form = new FormData();
  files.forEach((f) => form.append("files", f));
  return fetch(`${BASE}/notebooks/${notebookId}/sources`, {
    method: "POST",
    body: form,
  }).then(j<{ sources: SourceSummary[]; errors: UploadError[] }>);
};

export const addPaste = (notebookId: string, title: string, text: string) =>
  fetch(`${BASE}/notebooks/${notebookId}/sources/text`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title, text }),
  }).then((r) => {
    if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
  });

export const addUrl = (notebookId: string, url: string) =>
  fetch(`${BASE}/notebooks/${notebookId}/sources/url`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url }),
  }).then(j<SourceSummary>);

export const deleteSource = (id: string) =>
  fetch(`${BASE}/sources/${id}`, { method: "DELETE" }).then((r) => {
    if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
  });

export const search = (notebookId: string, q: string) =>
  fetch(`${BASE}/notebooks/${notebookId}/search?q=${encodeURIComponent(q)}`).then(
    j<SearchHit[]>
  );

export const searchWeb = (q: string) =>
  fetch(`${BASE}/web/search?q=${encodeURIComponent(q)}`).then(j<WebSearchResult[]>);

export const getAISettings = () => fetch(`${BASE}/settings/ai`).then(j<AISettings>);

export const saveAISettings = (apiKey: string, model: string) =>
  fetch(`${BASE}/settings/ai`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ api_key: apiKey, model }),
  }).then(j<AISettings>);

export const clearAISettings = () =>
  fetch(`${BASE}/settings/ai`, { method: "DELETE" }).then((res) => {
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  });

export const askNotebook = (notebookId: string, message: string) =>
  fetch(`${BASE}/notebooks/${notebookId}/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message }),
  }).then(j<ChatResponse>);
