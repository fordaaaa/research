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
