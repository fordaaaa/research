import type { SourceSummary } from "./base";

export interface UploadError {
  file: string;
  detail: string;
}

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

export interface AddPasteOptions {
  /** Confirm saving even though the exact text already exists. */
  force?: boolean;
}

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
