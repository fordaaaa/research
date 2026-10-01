import type { SourceSummary } from "./base";

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
