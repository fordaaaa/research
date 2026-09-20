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

export type AIProvider = "gemini" | "openrouter";

export interface AISettings {
  configured: boolean;
  provider: AIProvider | null;
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
  model: string | null;
}

export interface UploadError {
  file: string;
  detail: string;
}

export interface User {
  id: string;
  email: string;
}

export interface AuthResult {
  user: User;
  token: string;
}

const TOKEN_KEY = "research_token";

export const getToken = () => localStorage.getItem(TOKEN_KEY);
export const setToken = (token: string) => localStorage.setItem(TOKEN_KEY, token);
export const clearToken = () => localStorage.removeItem(TOKEN_KEY);

async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  const token = getToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  return fetch(path, { ...init, headers });
}

async function j<T>(res: Response): Promise<T> {
  if (res.status === 401) {
    clearToken();
    window.dispatchEvent(new Event("research:unauthorized"));
    throw new Error("login required");
  }
  if (!res.ok) {
    const body = await res.json().catch(() => null) as { detail?: string } | null;
    throw new Error(body?.detail || `${res.status} ${res.statusText}`);
  }
  return res.json() as Promise<T>;
}

export const register = (email: string, password: string) =>
  apiFetch(`${BASE}/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  }).then(j<AuthResult>);

export const login = (email: string, password: string) =>
  apiFetch(`${BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  }).then(j<AuthResult>);

export const logout = () =>
  apiFetch(`${BASE}/auth/logout`, { method: "POST" }).then((r) => {
    clearToken();
    if (!r.ok && r.status !== 401) throw new Error(`${r.status} ${r.statusText}`);
  });

export const me = () => apiFetch(`${BASE}/auth/me`).then(j<User>);

export interface GoogleStatus {
  enabled: boolean;
  client_id: string | null;
}

export const googleStatus = () =>
  apiFetch(`${BASE}/auth/google/status`).then(j<GoogleStatus>);

export const googleLogin = (idToken: string) =>
  apiFetch(`${BASE}/auth/google`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id_token: idToken }),
  }).then(j<AuthResult>);

const BASE = "/api";

export const listNotebooks = () => apiFetch(`${BASE}/notebooks`).then(j<Notebook[]>);

export const createNotebook = (name: string) =>
  apiFetch(`${BASE}/notebooks`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  }).then(j<Notebook>);

export const deleteNotebook = (id: string) =>
  apiFetch(`${BASE}/notebooks/${id}`, { method: "DELETE" }).then((r) => {
    if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
  });

export const exportNotebookUrl = (id: string) => `${BASE}/notebooks/${id}/export`;

// Shared authenticated download: apiFetch attaches `Authorization: Bearer`.
// Plain `<a href>` anchors cannot send the bearer token and fail with 401
// when login is required, so prefer fetchDownload/downloadFile (and the
// per-resource wrappers below) over the plain *Url helpers.
export interface DownloadedFile {
  blob: Blob;
  filename: string;
}

export type NotebookExport = DownloadedFile;

export function filenameFromContentDisposition(header: string | null, fallback: string): string {
  if (!header) return fallback;
  const star = header.match(/filename\*\s*=\s*(?:UTF-8''|utf-8'')?([^;]+)/i);
  if (star?.[1]) {
    try {
      const decoded = decodeURIComponent(star[1].trim().replace(/^"|"$/g, ""));
      if (decoded) return decoded;
    } catch {
      // fall through to the plain filename= form below
    }
  }
  const quoted =
    header.match(/filename\s*=\s*"([^"]+)"/i) ?? header.match(/filename\s*=\s*([^;]+)/i);
  const name = quoted?.[1]?.trim().replace(/^"|"$/g, "");
  return name || fallback;
}

export async function fetchDownload(path: string, fallbackFilename: string): Promise<DownloadedFile> {
  const res = await apiFetch(path);
  if (res.status === 401) {
    clearToken();
    window.dispatchEvent(new Event("research:unauthorized"));
    throw new Error("login required");
  }
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { detail?: string } | null;
    throw new Error(body?.detail || `${res.status} ${res.statusText}`);
  }
  const blob = await res.blob();
  const filename = filenameFromContentDisposition(res.headers.get("Content-Disposition"), fallbackFilename);
  return { blob, filename };
}

export function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export async function downloadFile(path: string, fallbackFilename: string): Promise<DownloadedFile> {
  const result = await fetchDownload(path, fallbackFilename);
  saveBlob(result.blob, result.filename);
  return result;
}

export async function fetchNotebookExport(id: string): Promise<NotebookExport> {
  return fetchDownload(`${BASE}/notebooks/${id}/export`, `notebook-${id}.zip`);
}

export async function downloadNotebook(id: string): Promise<NotebookExport> {
  return downloadFile(`${BASE}/notebooks/${id}/export`, `notebook-${id}.zip`);
}

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

export const addPaste = (notebookId: string, title: string, text: string) =>
  apiFetch(`${BASE}/notebooks/${notebookId}/sources/text`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title, text }),
  }).then((r) => {
    if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
  });

export const addUrl = (notebookId: string, url: string) =>
  apiFetch(`${BASE}/notebooks/${notebookId}/sources/url`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url }),
  }).then(j<SourceSummary>);

export interface SourceDetail extends SourceSummary {
  pages: { number: number; text: string }[];
  chunks: { seq: number; pages: number[]; text: string }[];
}

export const getSource = (id: string) =>
  apiFetch(`${BASE}/sources/${id}`).then(j<SourceDetail>);

export const deleteSource = (id: string) =>
  apiFetch(`${BASE}/sources/${id}`, { method: "DELETE" }).then((r) => {
    if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
  });

export const createDemo = () =>
  apiFetch(`${BASE}/demo`, { method: "POST" }).then(j<Notebook>);

export const search = (notebookId: string, q: string) =>
  apiFetch(`${BASE}/notebooks/${notebookId}/search?q=${encodeURIComponent(q)}`).then(
    j<SearchHit[]>
  );

export const searchWeb = (q: string) =>
  apiFetch(`${BASE}/web/search?q=${encodeURIComponent(q)}`).then(j<WebSearchResult[]>);

export const getAISettings = () => apiFetch(`${BASE}/settings/ai`).then(j<AISettings>);

export const saveAISettings = (apiKey: string, model: string, provider: AIProvider) =>
  apiFetch(`${BASE}/settings/ai`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ api_key: apiKey, model, provider }),
  }).then(j<AISettings>);

export const clearAISettings = () =>
  apiFetch(`${BASE}/settings/ai`, { method: "DELETE" }).then((res) => {
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  });

export interface ResearchPlan {
  topic: string;
  queries: string[];
  origin: "ai" | "heuristic";
}

export interface ResearchCandidate {
  title: string;
  url: string;
  snippet: string;
  score: number;
  matched_queries: string[];
}

export interface ResearchGather {
  candidates: ResearchCandidate[];
  failed_queries: string[];
}

export interface ResearchSynthesis {
  source: SourceSummary;
  origin: "ai" | "digest";
  model: string | null;
}

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

export const askNotebook = (notebookId: string, message: string) =>
  apiFetch(`${BASE}/notebooks/${notebookId}/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message }),
  }).then(j<ChatResponse>);

export interface OutlineItem {
  id: string;
  label: string;
}

export interface OutlineField {
  id: string;
  label: string;
}

export interface ResearchOutline {
  id: string;
  notebook_id: string;
  topic: string;
  items: OutlineItem[];
  fields: OutlineField[];
  created_at: string;
  updated_at: string;
}

export interface OutlineDraft {
  topic: string;
  items: string[];
  fields: string[];
  origin: "ai" | "heuristic";
}

export interface OutlineDeepItem {
  item_id: string;
  label: string;
  queries: string[];
  candidates: ResearchCandidate[];
}

export interface OutlineDeep {
  results: OutlineDeepItem[];
  failed_items: string[];
}

export interface OutlineReport {
  source: SourceSummary;
  origin: "ai" | "digest";
  model: string | null;
}

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
  apiFetch(`${BASE}/notebooks/${notebookId}/outlines/${outlineId}`, { method: "DELETE" }).then((r) => {
    if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
  });

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

export interface HumanizeFinding {
  pattern: string;
  label: string;
  excerpt: string;
  suggestion: string;
}

export interface HumanizeAnalysis {
  findings: HumanizeFinding[];
  signal_count: number;
}

export interface HumanizeRewrite {
  text: string;
  model: string | null;
}

export const analyzeHumanize = (text: string) =>
  apiFetch(`${BASE}/humanize/analyze`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  }).then(j<HumanizeAnalysis>);

export const rewriteHumanize = (text: string, voiceSample?: string) =>
  apiFetch(`${BASE}/humanize/rewrite`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(voiceSample ? { text, voice_sample: voiceSample } : { text }),
  }).then(j<HumanizeRewrite>);

export interface Skill {
  id: string;
  name: string;
  instructions: string;
  triggers: string[];
  created_at: string;
  updated_at: string;
}

export const listSkills = () => apiFetch(`${BASE}/skills`).then(j<Skill[]>);

export const createSkill = (body: { name: string; instructions: string; triggers: string[] }) =>
  apiFetch(`${BASE}/skills`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }).then(j<Skill>);

export const deleteSkill = (id: string) =>
  apiFetch(`${BASE}/skills/${id}`, { method: "DELETE" }).then((r) => {
    if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
  });

export const getMemory = (notebookId: string) =>
  apiFetch(`${BASE}/notebooks/${notebookId}/memory`).then(j<{ notes: string }>);

export const saveMemory = (notebookId: string, notes: string) =>
  apiFetch(`${BASE}/notebooks/${notebookId}/memory`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ notes }),
  }).then(j<{ notes: string }>);

export interface Flashcard {
  id: string;
  notebook_id: string;
  front: string;
  back: string;
  tags: string[];
  created_at: string;
  updated_at: string;
}

export const listCards = (notebookId: string) =>
  apiFetch(`${BASE}/notebooks/${notebookId}/cards`).then(j<Flashcard[]>);

export const createCard = (notebookId: string, body: { front: string; back: string }) =>
  apiFetch(`${BASE}/notebooks/${notebookId}/cards`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }).then(j<Flashcard>);

export const deleteCard = (notebookId: string, cardId: string) =>
  apiFetch(`${BASE}/notebooks/${notebookId}/cards/${cardId}`, { method: "DELETE" }).then((r) => {
    if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
  });

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

export interface MindmapNode {
  name: string;
  children?: MindmapNode[];
}

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
