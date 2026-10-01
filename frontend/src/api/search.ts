import { apiFetch, j, BASE } from "./client";
import type { SearchHit, WebSearchResult } from "./types";

export const search = (notebookId: string, q: string, signal?: AbortSignal) =>
  apiFetch(`${BASE}/notebooks/${notebookId}/search?q=${encodeURIComponent(q)}`, { signal }).then(
    j<SearchHit[]>
  );

export const searchWeb = (q: string) =>
  apiFetch(`${BASE}/web/search?q=${encodeURIComponent(q)}`).then(j<WebSearchResult[]>);
