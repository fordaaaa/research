export type AIProvider = "gemini" | "openrouter" | "groq";

export interface AISettings {
  configured: boolean;
  provider: AIProvider | null;
  model: string | null;
}

export interface Citation {
  source_id: string;
  source_title: string;
  pages: number[];
}

export interface ChatResponse {
  answer: string;
  citations: Citation[];
  model: string | null;
}

export interface ChatSession {
  id: string;
  notebook_id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

export interface ChatMessage {
  id: string;
  session_id: string;
  role: "user" | "assistant";
  text: string;
  citations: Citation[];
  model: string | null;
  created_at: string;
}
