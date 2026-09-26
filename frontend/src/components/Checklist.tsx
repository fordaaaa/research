import { useEffect, useMemo, useRef, useState } from "react";
import { Badge, Card } from "./ui";
import { playSuccess } from "../sound";

interface Props {
  userId: string;
  hasNotebook?: boolean;
  hasSource?: boolean;
  hasSearched?: boolean;
  hasExportedOrReviewed?: boolean;
  /** Fired when a row is activated. Navigation only — it never checks items off. */
  onAction?: (action: ChecklistAction) => void;
}

export type ChecklistAction = "notebook" | "source" | "search" | "review";

const ITEMS: { title: string; hint: string; action: ChecklistAction; cta: string }[] = [
  { title: "Create or open a notebook", hint: "One per class, project, or question.", action: "notebook", cta: "Go to notebooks" },
  { title: "Add a source", hint: "Drop in a PDF, paste text, or add a web page.", action: "source", cta: "Go to add a source" },
  { title: "Search or ask", hint: "Search your sources or ask AI about them.", action: "search", cta: "Go to search" },
  { title: "Export or review 1 card", hint: "Export the notebook or grade a flashcard.", action: "review", cta: "Go to export or review" },
];

const storageKey = (userId: string) => `notaeo:checklist:${userId}`;

function readStored(userId: string): boolean[] {
  try {
    const raw = localStorage.getItem(storageKey(userId));
    if (!raw) return [false, false, false, false];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [false, false, false, false];
    return [0, 1, 2, 3].map((i) => parsed[i] === true);
  } catch {
    return [false, false, false, false];
  }
}

export default function Checklist({
  userId,
  hasNotebook = false,
  hasSource = false,
  hasSearched = false,
  hasExportedOrReviewed = false,
  onAction,
}: Props) {
  // Persisted checks: once an item is genuinely done it stays done for this
  // user. Stored flags are only ever set from derived real state — there is
  // no manual toggle path, so completion cannot be faked.
  const [stored, setStored] = useState<boolean[]>(() => readStored(userId));
  const derived = [hasNotebook, hasSource, hasSearched, hasExportedOrReviewed];
  const checked = useMemo(
    () => derived.map((value, i) => value || stored[i]),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [hasNotebook, hasSource, hasSearched, hasExportedOrReviewed, stored],
  );
  const done = checked.filter(Boolean).length;
  const celebrated = useRef(false);

  useEffect(() => {
    setStored((prev) => {
      const next = derived.map((value, i) => prev[i] || value);
      return next.every((value, i) => value === prev[i]) ? prev : next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasNotebook, hasSource, hasSearched, hasExportedOrReviewed]);

  useEffect(() => {
    try {
      localStorage.setItem(storageKey(userId), JSON.stringify(stored));
    } catch {
      // Session-only when storage is unavailable.
    }
  }, [stored, userId]);

  useEffect(() => {
    if (done === ITEMS.length && !celebrated.current) {
      celebrated.current = true;
      playSuccess();
    } else if (done < ITEMS.length) {
      celebrated.current = false;
    }
  }, [done]);

  return (
    <Card className="p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-display text-lg font-semibold">Getting started</h2>
        {done === ITEMS.length ? (
          <Badge tone="good">All done ✓</Badge>
        ) : (
          <span className="text-xs font-medium text-neutral-400">{done} of 4</span>
        )}
      </div>
      <div
        className="mt-2 h-1.5 overflow-hidden rounded-full bg-neutral-800"
        role="progressbar"
        aria-valuenow={done}
        aria-valuemin={0}
        aria-valuemax={4}
        aria-label={`${done} of 4 steps complete`}
      >
        <div
          className="h-full rounded-full bg-aqua transition-all"
          style={{ width: `${(done / ITEMS.length) * 100}%` }}
        />
      </div>
      <ul className="mt-3 space-y-1.5">
        {ITEMS.map((item, i) => (
          <li key={item.title}>
            <button
              type="button"
              onClick={() => onAction?.(item.action)}
              aria-label={`${item.title} — ${checked[i] ? "done" : "not done"}. ${item.hint} ${item.cta}.`}
              className="flex min-h-11 w-full items-start gap-3 rounded-xl px-3 py-2 text-left transition-colors hover:bg-neutral-800/60"
            >
              <span
                aria-hidden="true"
                className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[11px] ${
                  checked[i]
                    ? "border-aqua bg-aqua text-neutral-950"
                    : "border-neutral-600 text-neutral-400"
                }`}
              >
                {checked[i] ? "✓" : String(i + 1)}
              </span>
              <span className="min-w-0">
                <span
                  className={`block text-sm font-medium ${
                    checked[i] ? "text-neutral-500 line-through" : ""
                  }`}
                >
                  {item.title}
                </span>
                <span className="block text-xs text-neutral-500">{item.hint}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
      {done === ITEMS.length && (
        <p className="mt-3 rounded-xl border border-emerald-900 bg-emerald-950/40 p-3 text-xs text-emerald-300">
          Nice — you have touched every core loop. Keep going from your library below.
        </p>
      )}
    </Card>
  );
}
