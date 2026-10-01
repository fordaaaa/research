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

export interface MindmapNode {
  name: string;
  children?: MindmapNode[];
}
