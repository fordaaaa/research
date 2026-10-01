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

// Shared authenticated download: apiFetch attaches `Authorization: Bearer`.
// Plain `<a href>` anchors cannot send the bearer token and fail with 401
// when login is required, so prefer fetchDownload/downloadFile (and the
// per-resource wrappers below) over the plain *Url helpers.
export interface DownloadedFile {
  blob: Blob;
  filename: string;
}

export type NotebookExport = DownloadedFile;
