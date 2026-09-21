import { useCallback, useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import * as api from "../../api";
import type { Flashcard, ReviewRating } from "../../api";
import { usePrefersReducedMotion } from "../../useMountTransition";
import { decideSwipe } from "./reviewGesture";
import { Button, EmptyState } from "../ui";

const RATING_ORDER: { value: ReviewRating; label: string; shortcut: string }[] = [
  { value: "again", label: "Again", shortcut: "1" },
  { value: "hard", label: "Hard", shortcut: "2" },
  { value: "good", label: "Good", shortcut: "3" },
  { value: "easy", label: "Easy", shortcut: "4" },
];

interface Props {
  notebookId: string;
  initialQueue: Flashcard[];
  onExit: () => void;
  onGraded?: (card: Flashcard) => void;
}

function intervalLabel(days: number): string {
  if (days <= 0) return "new";
  if (days < 1) return "today";
  const rounded = Math.round(days * 10) / 10;
  return `${rounded}d`;
}

export default function ReviewSession({ notebookId, initialQueue, onExit, onGraded }: Props) {
  const [queue, setQueue] = useState<Flashcard[]>(initialQueue);
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [grading, setGrading] = useState<ReviewRating | null>(null);
  const [gradedCount, setGradedCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [drag, setDrag] = useState<{ dx: number; dy: number } | null>(null);
  const startRef = useRef<{ x: number; y: number } | null>(null);
  const reducedMotion = usePrefersReducedMotion();

  const finished = index >= queue.length;
  const current = !finished ? queue[index] : null;

  const grade = useCallback(
    async (rating: ReviewRating) => {
      const target = queue[index];
      if (!target || grading) return;
      setGrading(rating);
      setError(null);
      try {
        const updated = await api.reviewCard(notebookId, target.id, rating);
        onGraded?.(updated);
        setQueue((q) => q.map((c) => (c.id === updated.id ? updated : c)));
        setGradedCount((n) => n + 1);
        setFlipped(false);
        setDrag(null);
        setIndex((i) => i + 1);
      } catch (err) {
        setError(err instanceof Error ? err.message : "could not save grade");
      } finally {
        setGrading(null);
      }
    },
    [notebookId, queue, index, grading, onGraded]
  );

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)
      ) {
        return;
      }
      if (!flipped || !current || grading) return;
      const byNumber = RATING_ORDER.find((r) => r.shortcut === event.key)?.value;
      if (byNumber) {
        event.preventDefault();
        void grade(byNumber);
        return;
      }
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        void grade("again");
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        void grade("good");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [flipped, current, grading, grade]);

  const pointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement | null;
    if (
      target &&
      typeof target.closest === "function" &&
      target.closest("button, a, input, textarea, select, [contenteditable], [role='button']")
    ) {
      startRef.current = null;
      return;
    }
    startRef.current = { x: event.clientX, y: event.clientY };
    try {
      event.currentTarget.setPointerCapture?.(event.pointerId);
    } catch {
      // jsdom and some touch browsers lack pointer capture — drag still works.
    }
  };

  const pointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const start = startRef.current;
    if (!start) return;
    setDrag({ dx: event.clientX - start.x, dy: event.clientY - start.y });
  };

  const endDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    const start = startRef.current;
    startRef.current = null;
    try {
      event.currentTarget.releasePointerCapture?.(event.pointerId);
    } catch {
      // ignore missing pointer-capture implementations
    }
    if (!start) return;
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    setDrag(null);
    if (!flipped || !current || grading) return;
    const selected =
      typeof window !== "undefined" && typeof window.getSelection === "function"
        ? (window.getSelection()?.toString() ?? "")
        : "";
    const rating = decideSwipe(dx, dy, { hasSelection: selected.trim().length > 0 });
    if (rating) void grade(rating);
  };

  if (queue.length === 0) {
    return (
      <div className="mt-3" data-testid="review-session">
        <EmptyState title="Nothing due right now." hint="New grades reschedule cards into this queue." />
        <div className="mt-3 text-center">
          <Button variant="secondary" onClick={onExit}>
            Back to deck
          </Button>
        </div>
      </div>
    );
  }

  if (finished || !current) {
    return (
      <div className="mt-3 rounded-xl border border-neutral-800 p-4 text-center" data-testid="review-session">
        <p className="text-sm font-medium">Review complete: {gradedCount} graded</p>
        <p className="mt-1 text-xs text-neutral-500">
          Grades are saved — reviewed cards return when they are due again.
        </p>
        <div className="mt-3 flex justify-center">
          <Button variant="secondary" onClick={onExit}>
            Back to deck
          </Button>
        </div>
      </div>
    );
  }

  const dragDx = drag?.dx ?? 0;
  const showHint = drag !== null && Math.abs(dragDx) > 24;

  return (
    <div className="mt-3" data-testid="review-session">
      <div className="flex items-center justify-between text-xs text-neutral-500">
        <span aria-live="polite">
          Card {index + 1} of {queue.length}
        </span>
        <span>
          {current.review_count === 0
            ? "New card"
            : `${current.review_count} past review${current.review_count === 1 ? "" : "s"} · ${intervalLabel(current.interval_days)} interval`}
        </span>
      </div>
      <div className="relative">
        <div
          data-testid="review-swipe-surface"
          data-motion={reducedMotion ? "reduced" : "full"}
          className={`mt-2 min-h-36 w-full rounded-xl border border-neutral-700 bg-neutral-950 p-5 text-center select-none ${
            reducedMotion ? "" : "transition-transform duration-150 ease-out active:scale-[0.99]"
          }`}
          style={{
            transform:
              !reducedMotion && drag ? `translateX(${dragDx}px) rotate(${dragDx / 24}deg)` : undefined,
            touchAction: "pan-y",
          }}
          onPointerDown={pointerDown}
          onPointerMove={pointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
        >
          <button
            className="w-full text-center"
            onClick={() => setFlipped((f) => !f)}
            aria-label={flipped ? "Hide answer" : "Show answer"}
          >
            <span className="text-[11px] uppercase tracking-wider text-neutral-600">
              {flipped ? "answer — tap to hide" : "question — tap to reveal"}
            </span>
            <span className="mt-2 block whitespace-pre-wrap text-base leading-relaxed">
              {flipped ? current.back : current.front}
            </span>
          </button>
        </div>
        {showHint && !reducedMotion && (
          <div
            aria-hidden="true"
            className={`pointer-events-none absolute inset-y-0 flex items-center text-sm font-semibold ${
              dragDx > 0 ? "left-3 text-emerald-400" : "right-3 text-red-400"
            }`}
          >
            {dragDx > 0 ? "Good →" : "← Again"}
          </div>
        )}
      </div>
      {!flipped ? (
        <p className="mt-2 text-center text-xs text-neutral-600">
          Recall the answer out loud, then tap to check. Swipe right for good, left for again — or use the buttons below.
        </p>
      ) : (
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4" role="group" aria-label="Grade this card">
          {RATING_ORDER.map((r) => (
            <Button
              key={r.value}
              variant={r.value === "good" ? "primary" : "secondary"}
              className="flex-1"
              title={`Shortcut: ${r.shortcut}`}
              disabled={grading !== null}
              onClick={() => void grade(r.value)}
            >
              {grading === r.value ? "Saving…" : r.label}
            </Button>
          ))}
        </div>
      )}
      {error && (
        <p role="alert" className="mt-2 text-xs text-red-400">
          Could not save grade: {error}
        </p>
      )}
      <div className="mt-2 text-center">
        <button className="text-xs text-neutral-600 hover:text-neutral-300" onClick={onExit}>
          End session
        </button>
      </div>
    </div>
  );
}
