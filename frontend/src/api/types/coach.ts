import type { Citation } from "./ai";

export interface ExamGoal {
  title: string;
  exam_date: string;
  daily_minutes: number;
  focus_topics: string[];
}
export interface CoachTask {
  id: string;
  topic: string;
  prompt: string;
  answer: string;
  minutes: number;
  reason: string;
  source_id: string | null;
  source_title: string | null;
  pages: number[];
  chunk_seq: number | null;
  card_id: string | null;
}
export interface CoachAttemptInput {
  task_id: string;
  rating: "got_it" | "revise";
  response: string;
}
export interface CoachAttempt extends CoachAttemptInput { created_at: string }
export interface CoachSession {
  id: string;
  notebook_id: string;
  goal: ExamGoal;
  status: "draft" | "active" | "completed";
  generated_by: "basic" | "ai";
  notice: string | null;
  tasks: CoachTask[];
  attempts: CoachAttempt[];
  created_at: string;
  completed_at: string | null;
}
export interface CoachState { goal: ExamGoal | null; sessions: CoachSession[] }
export interface CoachExplanation {
  answer: string;
  citations: Citation[];
  model: string | null;
  generated_by: "basic" | "ai";
  notice: string | null;
}
