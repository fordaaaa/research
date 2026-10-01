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
