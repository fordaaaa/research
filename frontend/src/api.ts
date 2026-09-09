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

export const exportNotebookUrl = (id: string) => `${BASE}/notebooks/${id}/export`;

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

export interface SourceDetail extends SourceSummary {
  pages: { number: number; text: string }[];
  chunks: { seq: number; pages: number[]; text: string }[];
}

export const getSource = (id: string) =>
  fetch(`${BASE}/sources/${id}`).then(j<SourceDetail>);

export const deleteSource = (id: string) =>
  fetch(`${BASE}/sources/${id}`, { method: "DELETE" }).then((r) => {
    if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
  });

export const createDemo = () =>
  fetch(`${BASE}/demo`, { method: "POST" }).then(j<Notebook>);

export const search = (notebookId: string, q: string) =>
  fetch(`${BASE}/notebooks/${notebookId}/search?q=${encodeURIComponent(q)}`).then(
    j<SearchHit[]>
  );

export const searchWeb = (q: string) =>
  fetch(`${BASE}/web/search?q=${encodeURIComponent(q)}`).then(j<WebSearchResult[]>);

export const getAISettings = () => fetch(`${BASE}/settings/ai`).then(j<AISettings>);

export const saveAISettings = (apiKey: string, model: string, provider: AIProvider) =>
  fetch(`${BASE}/settings/ai`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ api_key: apiKey, model, provider }),
  }).then(j<AISettings>);

export const clearAISettings = () =>
  fetch(`${BASE}/settings/ai`, { method: "DELETE" }).then((res) => {
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
  fetch(`${BASE}/notebooks/${notebookId}/research/plan`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ topic }),
  }).then(j<ResearchPlan>);

export const gatherResearch = (notebookId: string, queries: string[]) =>
  fetch(`${BASE}/notebooks/${notebookId}/research/gather`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ queries }),
  }).then(j<ResearchGather>);

export const synthesizeResearch = (notebookId: string, body: { topic: string; queries: string[] }) =>
  fetch(`${BASE}/notebooks/${notebookId}/research/synthesize`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }).then(j<ResearchSynthesis>);

export const askNotebook = (notebookId: string, message: string) =>
  fetch(`${BASE}/notebooks/${notebookId}/chat`, {
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
  fetch(`${BASE}/notebooks/${notebookId}/outlines`).then(j<ResearchOutline[]>);

export const createOutline = (notebookId: string, body: { topic: string; items: { label: string }[]; fields: { label: string }[] }) =>
  fetch(`${BASE}/notebooks/${notebookId}/outlines`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }).then(j<ResearchOutline>);

export const updateOutline = (notebookId: string, outlineId: string, body: { topic?: string; items?: OutlineItem[]; fields?: OutlineField[] }) =>
  fetch(`${BASE}/notebooks/${notebookId}/outlines/${outlineId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }).then(j<ResearchOutline>);

export const deleteOutline = (notebookId: string, outlineId: string) =>
  fetch(`${BASE}/notebooks/${notebookId}/outlines/${outlineId}`, { method: "DELETE" }).then((r) => {
    if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
  });

export const draftOutline = (notebookId: string, topic: string) =>
  fetch(`${BASE}/notebooks/${notebookId}/outlines/draft`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ topic }),
  }).then(j<OutlineDraft>);

export const deepOutline = (notebookId: string, outlineId: string, perItem = 4) =>
  fetch(`${BASE}/notebooks/${notebookId}/outlines/${outlineId}/deep`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ per_item: perItem }),
  }).then(j<OutlineDeep>);

export const reportOutline = (notebookId: string, outlineId: string) =>
  fetch(`${BASE}/notebooks/${notebookId}/outlines/${outlineId}/report`, {
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
  fetch(`${BASE}/humanize/analyze`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  }).then(j<HumanizeAnalysis>);

export const rewriteHumanize = (text: string, voiceSample?: string) =>
  fetch(`${BASE}/humanize/rewrite`, {
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

export const listSkills = () => fetch(`${BASE}/skills`).then(j<Skill[]>);

export const createSkill = (body: { name: string; instructions: string; triggers: string[] }) =>
  fetch(`${BASE}/skills`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }).then(j<Skill>);

export const deleteSkill = (id: string) =>
  fetch(`${BASE}/skills/${id}`, { method: "DELETE" }).then((r) => {
    if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
  });

export const getMemory = (notebookId: string) =>
  fetch(`${BASE}/notebooks/${notebookId}/memory`).then(j<{ notes: string }>);

export const saveMemory = (notebookId: string, notes: string) =>
  fetch(`${BASE}/notebooks/${notebookId}/memory`, {
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
  fetch(`${BASE}/notebooks/${notebookId}/cards`).then(j<Flashcard[]>);

export const createCard = (notebookId: string, body: { front: string; back: string }) =>
  fetch(`${BASE}/notebooks/${notebookId}/cards`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }).then(j<Flashcard>);

export const deleteCard = (notebookId: string, cardId: string) =>
  fetch(`${BASE}/notebooks/${notebookId}/cards/${cardId}`, { method: "DELETE" }).then((r) => {
    if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
  });

export const exportCardsUrl = (notebookId: string) => `${BASE}/notebooks/${notebookId}/cards/export`;

export const getGuide = (notebookId: string) =>
  fetch(`${BASE}/notebooks/${notebookId}/guide`).then(j<{ markdown: string }>);

export const saveGuide = (notebookId: string) =>
  fetch(`${BASE}/notebooks/${notebookId}/guide`, { method: "POST" }).then(j<{ source: SourceSummary }>);

export interface MindmapNode {
  name: string;
  children?: MindmapNode[];
}

export const getMindmap = (notebookId: string) =>
  fetch(`${BASE}/notebooks/${notebookId}/mindmap`).then(j<MindmapNode>);

export const exportMindmapUrl = (notebookId: string) => `${BASE}/notebooks/${notebookId}/mindmap/export`;
