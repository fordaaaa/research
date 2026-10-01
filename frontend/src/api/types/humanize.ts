export interface HumanizeFinding {
  pattern: string;
  label: string;
  excerpt: string;
  suggestion: string;
}

export interface HumanizeAnalysis {
  findings: HumanizeFinding[];
  signal_count: number;
}

export interface HumanizeRewrite {
  text: string;
  model: string | null;
}

export type HumanizeFixOperation =
  | "straighten_quotes"
  | "remove_decoration"
  | "remove_staged_runup"
  | "reduce_repeated_openings";

export interface HumanizeFix {
  text: string;
  operations: { operation: HumanizeFixOperation; count: number }[];
}
