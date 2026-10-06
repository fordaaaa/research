import { useState } from "react";
import type { OrbState } from "thinking-orbs";
import AIActivity from "./AIActivity";
import FolioLoader from "./FolioLoader";
import FlashcardFace from "./study/FlashcardFace";
import { Button } from "./ui";

type Mode = "loading" | "cards" | "ai";
const MODES: { value: Mode; label: string }[] = [
  { value: "loading", label: "Loading" },
  { value: "cards", label: "Flashcards" },
  { value: "ai", label: "AI thinking" },
];
const STAGES = ["Opening notebook…", "Preparing source list…", "Ready to study…"];
const STYLES: { value: OrbState; label: string }[] = [
  { value: "working", label: "Thinking" },
  { value: "searching", label: "Searching" },
  { value: "solving", label: "Reasoning" },
  { value: "composing", label: "Writing" },
  { value: "connecting", label: "Connecting" },
  { value: "weaving", label: "Gathering" },
  { value: "listening", label: "Listening" },
  { value: "breathing", label: "Working" },
  { value: "shaping", label: "Forming" },
];
const CARDS = [
  { front: "What is ATP?", back: "The cell’s main energy carrier." },
  { front: "What carries genetic information?", back: "DNA." },
];

export default function MotionPreview() {
  const [mode, setMode] = useState<Mode>("loading");
  const [cardIndex, setCardIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [style, setStyle] = useState<OrbState>("working");
  const [outcome, setOutcome] = useState<"thinking" | "answer" | "error">("thinking");
  const card = CARDS[cardIndex];

  return (
    <section aria-label="Motion preview" className="mt-3 space-y-3 rounded-xl border border-neutral-800 p-3">
      <p className="text-xs leading-relaxed text-neutral-500">Sample interactions. No AI request is sent and no study progress is saved. Your device’s reduced motion setting applies.</p>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Preview type">
        {MODES.map((item) => <Button key={item.value} variant="secondary" aria-pressed={mode === item.value}
          onClick={() => { setMode(item.value); setOutcome("thinking"); setFlipped(false); }}>
          {item.label}
        </Button>)}
      </div>
      <div key={mode} className="animate-phase-in">
        {mode === "loading" && <FolioLoader compact title="Opening notebook…" stages={STAGES} />}
        {mode === "cards" && <>
          <div key={cardIndex} className="animate-review-enter rounded-xl border border-neutral-700 bg-neutral-950 p-5">
            <FlashcardFace front={card.front} back={card.back} flipped={flipped} onFlip={() => setFlipped((value) => !value)} />
          </div>
          <Button variant="secondary" className="mt-3" onClick={() => { setCardIndex((value) => (value + 1) % CARDS.length); setFlipped(false); }}>Next sample card</Button>
        </>}
        {mode === "ai" && <div className="space-y-3">
          <label className="block text-xs font-medium text-neutral-300">
            Thinking style
            <select className="mt-1 min-h-11 w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 text-sm"
              value={style} onChange={(event) => { setStyle(event.target.value as OrbState); setOutcome("thinking"); }}>
              {STYLES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
            </select>
          </label>
          <div aria-live="polite">
            {outcome === "thinking" && <AIActivity state={style} />}
            {outcome === "answer" && <article className="animate-chat-message rounded-xl bg-neutral-950 p-3 text-sm">
              <p className="mb-1 text-xs text-neutral-500">Sample answer</p>
              <p>Mitochondria help cells produce ATP.</p>
            </article>}
            {outcome === "error" && <p role="alert" className="animate-phase-in rounded-xl border border-neutral-700 p-3 text-sm text-red-400">Sample error: the request could not finish. Try again.</p>}
          </div>
          <div className="flex flex-wrap gap-2">
            {outcome === "thinking" ? <>
              <Button variant="secondary" onClick={() => setOutcome("answer")}>Show sample answer</Button>
              <Button variant="secondary" onClick={() => setOutcome("error")}>Show sample error</Button>
            </> : <Button variant="secondary" onClick={() => setOutcome("thinking")}>Replay thinking</Button>}
          </div>
        </div>}
      </div>
    </section>
  );
}
