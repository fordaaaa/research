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

export interface NoteCitation {
  source_id: string;
  chunk_seq: number;
}

export interface NoteSummary {
  id: string;
  notebook_id: string;
  title: string;
  tags: string[];
  citations: NoteCitation[];
  rev: number;
  created_at: string;
  updated_at: string;
}

export interface Note extends NoteSummary {
  body: string;
}

export interface NoteUpdate {
  base_rev: number;
  title?: string;
  body?: string;
  tags?: string[];
  citations?: NoteCitation[];
}

export class NoteConflictError extends Error {
  current: Note;

  constructor(current: Note) {
    super("This note changed in another editor.");
    this.name = "NoteConflictError";
    this.current = current;
  }
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

export interface ChatSession {
  id: string;
  notebook_id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

export interface ChatMessage {
  id: string;
  session_id: string;
  role: "user" | "assistant";
  text: string;
  citations: Citation[];
  model: string | null;
  created_at: string;
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

/**
 * Round 21 item 8: duplicate-register arrives as a 200-generic with no
 * session (`{registered: false, detail, token: none}`). The UI reads
 * `registered`/`detail` only — never treats this as authed.
 */
export interface RegisterDuplicate {
  registered: false;
  detail: string;
}

export function isRegisterDuplicate(value: unknown): value is RegisterDuplicate {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { registered?: unknown }).registered === false
  );
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

/**
 * Humanizes a Retry-After wait for display: waits of a minute or more round
 * to minutes ("5 minutes"), shorter waits stay in seconds ("45 seconds"),
 * and an absent wait reads "shortly".
 */
export function humanizeRetryWait(wait: number | null | undefined): string {
  if (wait === null || wait === undefined) return "shortly";
  if (wait >= 60) {
    const minutes = Math.round(wait / 60);
    return `${minutes} minute${minutes === 1 ? "" : "s"}`;
  }
  return `${wait} second${wait === 1 ? "" : "s"}`;
}

/** Rate-limit signal: carries the parsed Retry-After wait, if the server sent one. */
export class RateLimitError extends Error {
  retryAfterSeconds: number | null;
  status = 429 as const;

  constructor(retryAfterSeconds: number | null, message?: string) {
    super(
      message ??
        (retryAfterSeconds !== null
          ? `Too many attempts — try again in ${humanizeRetryWait(retryAfterSeconds)}`
          : "Too many attempts — try again shortly"),
    );
    this.name = "RateLimitError";
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

/** Parses a Retry-After header (delta-seconds or HTTP-date) into seconds. */
export function parseRetryAfter(res: Response): number | null {
  const raw = res.headers.get("Retry-After");
  if (!raw) return null;
  const trimmed = raw.trim();
  if (/^\d+$/.test(trimmed)) return Number(trimmed);
  const timestamp = Date.parse(trimmed);
  if (!Number.isNaN(timestamp)) return Math.max(0, Math.round((timestamp - Date.now()) / 1000));
  return null;
}

/**
 * Round 18 item 7 (422 audit): extracts a human-readable message from an
 * error body. FastAPI validation failures carry `detail` as an array of
 * `{loc, msg, type}` objects — rendering those raw leaks pydantic `loc`
 * voice (or "[object Object]" via Error coercion). String details pass
 * through; arrays join their `msg` fields; anything else falls back.
 */
export function detailMessage(body: unknown, fallback: string): string {
  if (typeof body === "string") return body || fallback;
  if (body && typeof body === "object") {
    const detail = (body as { detail?: unknown }).detail;
    if (typeof detail === "string") return detail || fallback;
    if (Array.isArray(detail)) {
      const msgs = detail
        .map((item) =>
          item && typeof item === "object" ? (item as { msg?: unknown }).msg : null,
        )
        .filter((msg): msg is string => typeof msg === "string" && msg.length > 0);
      if (msgs.length > 0) return msgs.join("; ");
      return fallback;
    }
    if (detail && typeof detail === "object") {
      const msg = (detail as { msg?: unknown }).msg;
      if (typeof msg === "string" && msg) return msg;
      return fallback;
    }
  }
  return fallback;
}

/**
 * Round 18 item 7 (422 audit): search failures render a friendly line, never
 * a raw validation payload. Anything carrying pydantic `loc` voice (or the
 * "[object Object]" of a coerced detail array) collapses to the friendly
 * fallback; honest messages ("login required", rate-limit waits) pass
 * through untouched.
 */
export function friendlySearchError(err: unknown, fallback = "Search failed — try again"): string {
  const message = err instanceof Error ? err.message : fallback;
  if (!message || /\[object Object\]|\bloc\b/i.test(message)) return fallback;
  return message;
}

async function j<T>(res: Response): Promise<T> {
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
  return res.json() as Promise<T>;
}

/** 401-aware check for empty (204/200-without-body) responses. */
async function jVoid(res: Response): Promise<void> {
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
}

export const register = (email: string, password: string) =>
  apiFetch(`${BASE}/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  }).then(j<AuthResult | RegisterDuplicate>);

export const login = (email: string, password: string) =>
  apiFetch(`${BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  }).then((res) => {
    // Bad credentials are not an expired session; keep the auth form visible.
    if (res.status === 401) throw new Error("Incorrect email or password");
    return j<AuthResult>(res);
  });

export const logout = () =>
  apiFetch(`${BASE}/auth/logout`, { method: "POST" }).then((r) => {
    clearToken();
    if (!r.ok && r.status !== 401) throw new Error(`${r.status} ${r.statusText}`);
  });

export const me = () => apiFetch(`${BASE}/auth/me`).then(j<User>);

export interface UserProgress {
  add_source: boolean;
  search: boolean;
  export: boolean;
  review: boolean;
}

/**
 * Round 20 item 2: per-user persisted checklist flags. Old servers without
 * this route reject (404/405/HTML) — callers catch and fall back to local.
 */
export const getProgress = () =>
  apiFetch(`${BASE}/me/progress`).then(j<UserProgress>);

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
  }).then((res) => {
    if (res.status === 401) throw new Error("Google sign-in failed");
    return j<AuthResult>(res);
  });

const BASE = "/api";

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
  if (res.status === 429) throw new RateLimitError(parseRetryAfter(res));
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as unknown;
    throw new Error(detailMessage(body, `${res.status} ${res.statusText}`));
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

/** Additive duplicate hint the backend may return on paste/URL add. */
export interface DuplicateRef {
  id: string;
  title: string;
}

export interface AddSourceResult {
  /**
   * New contract: HTTP 200 + saved:false means NOTHING was persisted
   * (warn-before-save). 201 + saved:true means saved. Old backends omit
   * the field and always save (warn-after-save); treat those as saved.
   */
  saved?: boolean;
  duplicate_of?: DuplicateRef | null;
}

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

export interface AddPasteOptions {
  /** Confirm saving even though the exact text already exists. */
  force?: boolean;
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

export interface SourceDetail extends SourceSummary {
  pages: { number: number; text: string }[];
  chunks: { seq: number; pages: number[]; text: string }[];
  canonical_url?: string | null;
  site_name?: string | null;
  byline?: string | null;
  published?: string | null;
  important_passages?: {
    text: string;
    score: number;
    chunk_seq: number;
    pages: number[];
  }[];
}

export const getSource = (id: string) =>
  apiFetch(`${BASE}/sources/${id}`).then(j<SourceDetail>);

export const deleteSource = (id: string) =>
  apiFetch(`${BASE}/sources/${id}`, { method: "DELETE" }).then(jVoid);

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

export const createDemo = () =>
  apiFetch(`${BASE}/demo`, { method: "POST" }).then(j<Notebook>);

export const search = (notebookId: string, q: string, signal?: AbortSignal) =>
  apiFetch(`${BASE}/notebooks/${notebookId}/search?q=${encodeURIComponent(q)}`, { signal }).then(
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
  apiFetch(`${BASE}/settings/ai`, { method: "DELETE" }).then(jVoid);

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

export const listChatSessions = (notebookId: string) =>
  apiFetch(`${BASE}/notebooks/${notebookId}/chat/sessions`).then(j<ChatSession[]>);

export const createChatSession = (notebookId: string, title?: string) =>
  apiFetch(`${BASE}/notebooks/${notebookId}/chat/sessions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(title ? { title } : {}),
  }).then(j<ChatSession>);

export const getChatSession = (notebookId: string, sessionId: string) =>
  apiFetch(`${BASE}/notebooks/${notebookId}/chat/sessions/${sessionId}`).then(j<ChatSession>);

export const deleteChatSession = (notebookId: string, sessionId: string) =>
  apiFetch(`${BASE}/notebooks/${notebookId}/chat/sessions/${sessionId}`, { method: "DELETE" }).then(jVoid);

export const listChatMessages = (notebookId: string, sessionId: string, limit?: number, before?: string) => {
  const params = new URLSearchParams();
  if (limit !== undefined) params.set("limit", String(limit));
  if (before) params.set("before", before);
  const query = params.toString();
  return apiFetch(
    `${BASE}/notebooks/${notebookId}/chat/sessions/${sessionId}/messages${query ? `?${query}` : ""}`
  ).then(j<ChatMessage[]>);
};

export const sendChatMessage = (notebookId: string, sessionId: string, message: string) =>
  apiFetch(`${BASE}/notebooks/${notebookId}/chat/sessions/${sessionId}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message }),
  }).then(j<ChatMessage>);

export const getHostedAIStatus = () => {
  // Logged-out boot has no bearer token: skip the fetch (mirrors the api.me
  // gate) instead of firing an authed request that 401s as console noise.
  if (!getToken()) return Promise.resolve({ enabled: false, allowance_remaining: null });
  return apiFetch(`${BASE}/ai/hosted/status`).then(j<{ enabled: boolean; allowance_remaining: number | null }>);
};

export const sendHostedChatMessage = (notebookId: string, sessionId: string, message: string) =>
  apiFetch(`${BASE}/ai/hosted/notebooks/${notebookId}/chat/sessions/${sessionId}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message }),
  }).then(j<ChatMessage>);

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

export type HumanizeFixOperation =
  | "straighten_quotes"
  | "remove_decoration"
  | "remove_staged_runup"
  | "reduce_repeated_openings";

export interface HumanizeFix {
  text: string;
  operations: { operation: HumanizeFixOperation; count: number }[];
}

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
  apiFetch(`${BASE}/skills/${id}`, { method: "DELETE" }).then(jVoid);

export const getMemory = (notebookId: string) =>
  apiFetch(`${BASE}/notebooks/${notebookId}/memory`).then(j<{ notes: string }>);

export const saveMemory = (notebookId: string, notes: string) =>
  apiFetch(`${BASE}/notebooks/${notebookId}/memory`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ notes }),
  }).then(j<{ notes: string }>);

export type ReviewRating = "again" | "hard" | "good" | "easy";

export interface Flashcard {
  id: string;
  notebook_id: string;
  front: string;
  back: string;
  tags: string[];
  created_at: string;
  updated_at: string;
  interval_days: number;
  review_count: number;
  due_at: string;
  last_reviewed_at: string | null;
}

export interface CardSuggestion {
  front: string;
  back: string;
  source_id: string;
  source_title: string;
  pages: number[];
  chunk_seq: number;
}

export interface CardUpdate {
  front?: string;
  back?: string;
  tags?: string[];
}

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

export interface GlossaryEntry {
  term: string;
  explanation: string;
  source_id: string;
  source_title: string;
  pages: number[];
  chunk_seq: number;
}

export type QuizQuestionType = "short_answer" | "cloze";

export interface QuizQuestion {
  question_type: QuizQuestionType;
  prompt: string;
  answer: string;
  term: string;
  source_id: string;
  source_title: string;
  pages: number[];
  chunk_seq: number;
}

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

// ---------- dashboard, calendar, classes, classroom ----------

export interface ActivityDay {
  day: string;
  reviews: number;
  sources: number;
  notes: number;
}

export interface Streak {
  current: number;
  longest: number;
  reviewed_today: boolean;
}

export interface DueByNotebook {
  notebook_id: string;
  notebook_name: string;
  due: number;
}

export interface CalendarCardDue {
  notebook_id: string;
  notebook_name: string;
  count: number;
}

export type ClassSource = "manual" | "google_classroom";

export interface StudyClass {
  id: string;
  name: string;
  color: string;
  source: ClassSource;
  external_id: string;
  created_at: string;
  updated_at: string;
}

export interface Assignment {
  id: string;
  class_id: string | null;
  class_name: string | null;
  title: string;
  details: string;
  due_at: string | null;
  done: boolean;
  notebook_id: string | null;
  source: ClassSource;
  external_id: string;
  created_at: string;
  updated_at: string;
}

export interface CalendarDay {
  day: string;
  assignments: Assignment[];
  card_due: CalendarCardDue[];
}

export interface RecentNote {
  id: string;
  notebook_id: string;
  notebook_name: string;
  title: string;
  updated_at: string;
}

export interface RecentSource {
  id: string;
  notebook_id: string;
  notebook_name: string;
  title: string;
  created_at: string;
}

export interface DashboardSummary {
  due_total: number;
  due_by_notebook: DueByNotebook[];
  streak: Streak;
  calendar: CalendarDay[];
  recent_notes: RecentNote[];
  recent_sources: RecentSource[];
  classes: StudyClass[];
}

export interface QueuedCard {
  card: Flashcard;
  notebook_id: string;
  notebook_name: string;
}

export interface ClassroomStatus {
  enabled: boolean;
  connected: boolean;
  last_sync_at: string | null;
  reason: string | null;
}

export interface ClassroomSyncResult {
  classes_synced: number;
  assignments_synced: number;
  assignments_skipped: number;
}

export interface NewAssignment {
  title: string;
  details?: string;
  class_id?: string | null;
  due_at?: string | null;
  notebook_id?: string | null;
}

export const getDashboard = () =>
  apiFetch(`${BASE}/me/dashboard`).then(j<DashboardSummary>);

export const listClasses = () => apiFetch(`${BASE}/classes`).then(j<StudyClass[]>);

export const createClass = (name: string, color: string) =>
  apiFetch(`${BASE}/classes`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, color }),
  }).then(j<StudyClass>);

export const updateClass = (id: string, fields: { name?: string; color?: string }) =>
  apiFetch(`${BASE}/classes/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(fields),
  }).then(j<StudyClass>);

export const deleteClass = (id: string) =>
  apiFetch(`${BASE}/classes/${id}`, { method: "DELETE" }).then(jVoid);

export const listAssignments = () =>
  apiFetch(`${BASE}/assignments`).then(j<Assignment[]>);

export const createAssignment = (body: NewAssignment) =>
  apiFetch(`${BASE}/assignments`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }).then(j<Assignment>);

export const updateAssignment = (
  id: string,
  fields: { title?: string; done?: boolean; due_at?: string | null; class_id?: string | null; notebook_id?: string | null }
) =>
  apiFetch(`${BASE}/assignments/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(fields),
  }).then(j<Assignment>);

export const deleteAssignment = (id: string) =>
  apiFetch(`${BASE}/assignments/${id}`, { method: "DELETE" }).then(jVoid);

export const getCalendar = (days = 35) =>
  apiFetch(`${BASE}/me/calendar?days=${days}`).then(j<CalendarDay[]>);

export const getUserReviewQueue = (limit = 50) =>
  apiFetch(`${BASE}/me/review-queue?limit=${limit}`).then(j<QueuedCard[]>);

export const reviewUserCard = (cardId: string, rating: ReviewRating) =>
  apiFetch(`${BASE}/me/cards/${cardId}/review`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ rating }),
  }).then(j<QueuedCard>);

export const getClassroomStatus = () =>
  apiFetch(`${BASE}/classroom/status`).then(j<ClassroomStatus>);

export const getClassroomAuthorizeUrl = () =>
  apiFetch(`${BASE}/classroom/authorize`).then(j<{ authorize_url: string }>);

export const syncClassroom = () =>
  apiFetch(`${BASE}/classroom/sync`, { method: "POST" }).then(j<ClassroomSyncResult>);

export const disconnectClassroom = () =>
  apiFetch(`${BASE}/classroom/connection`, { method: "DELETE" }).then(jVoid);
