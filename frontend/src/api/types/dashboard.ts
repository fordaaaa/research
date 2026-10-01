import type { Flashcard } from "./study";

// ---------- dashboard, calendar, classes, classroom ----------

export interface ActivityDay {
  day: string;
  reviews: number;
  sources: number;
  notes: number;
}

export interface Streak {
  current: number;
  longest: number;
  reviewed_today: boolean;
}

export interface DueByNotebook {
  notebook_id: string;
  notebook_name: string;
  due: number;
}

export interface CalendarCardDue {
  notebook_id: string;
  notebook_name: string;
  count: number;
}

export type ClassSource = "manual" | "google_classroom";

export interface StudyClass {
  id: string;
  name: string;
  color: string;
  source: ClassSource;
  external_id: string;
  created_at: string;
  updated_at: string;
}

export interface Assignment {
  id: string;
  class_id: string | null;
  class_name: string | null;
  title: string;
  details: string;
  due_at: string | null;
  done: boolean;
  notebook_id: string | null;
  source: ClassSource;
  external_id: string;
  created_at: string;
  updated_at: string;
}

export interface CalendarDay {
  day: string;
  assignments: Assignment[];
  card_due: CalendarCardDue[];
}

export interface RecentNote {
  id: string;
  notebook_id: string;
  notebook_name: string;
  title: string;
  updated_at: string;
}

export interface RecentSource {
  id: string;
  notebook_id: string;
  notebook_name: string;
  title: string;
  created_at: string;
}

export interface DashboardSummary {
  due_total: number;
  due_by_notebook: DueByNotebook[];
  streak: Streak;
  calendar: CalendarDay[];
  recent_notes: RecentNote[];
  recent_sources: RecentSource[];
  classes: StudyClass[];
}

export interface QueuedCard {
  card: Flashcard;
  notebook_id: string;
  notebook_name: string;
}

export interface NewAssignment {
  title: string;
  details?: string;
  class_id?: string | null;
  due_at?: string | null;
  notebook_id?: string | null;
}
