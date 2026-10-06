import type { OrbState } from "thinking-orbs";
import ThinkingDots from "./ThinkingDots";

export default function AIActivity({ state = "working" }: { state?: OrbState }) {
  return (
    <div className="animate-phase-in flex items-center gap-3 rounded-xl border border-neutral-800 bg-neutral-950 p-3">
      <ThinkingDots state={state} />
      <p className="text-sm text-neutral-500">Thinking…</p>
    </div>
  );
}
