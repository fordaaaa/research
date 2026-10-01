import type { SourceSummary } from "./base";
import type { ResearchCandidate } from "./research";

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
