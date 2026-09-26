import { useRef, useState } from "react";
import type { ButtonHTMLAttributes, PointerEvent, ReactNode } from "react";
import { usePrefersReducedMotion } from "../useMountTransition";

type Variant = "primary" | "secondary" | "ghost" | "danger";

const VARIANTS: Record<Variant, string> = {
  primary:
    "bg-neutral-100 text-neutral-900 hover:bg-neutral-200 disabled:opacity-50",
  secondary:
    "border border-neutral-700 text-neutral-200 hover:bg-neutral-800 disabled:opacity-50",
  ghost: "text-neutral-400 hover:text-neutral-100 hover:bg-neutral-900 disabled:opacity-50",
  danger: "text-neutral-500 hover:text-red-400 disabled:opacity-50",
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
}

export function Button({ variant = "primary", className = "", ...rest }: ButtonProps) {
  return (
    <button
      className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium transition active:scale-[0.98] disabled:cursor-not-allowed ${VARIANTS[variant]} ${className}`}
      {...rest}
    />
  );
}

export function Card({ className = "", children }: { className?: string; children: ReactNode }) {
  return (
    <div className={`rounded-2xl border border-neutral-800 bg-neutral-900 shadow-[0_4px_22px_rgba(6,48,62,0.035)] ${className}`}>
      {children}
    </div>
  );
}

export function SectionHeader({ title, sub, right }: { title: string; sub?: string; right?: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div>
        <h2 className="text-sm font-semibold tracking-tight">{title}</h2>
        {sub && <p className="mt-0.5 text-xs leading-relaxed text-neutral-500">{sub}</p>}
      </div>
      {right}
    </div>
  );
}

export function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "good" | "warn" }) {
  const tones = {
    neutral: "bg-neutral-800 text-neutral-300",
    good: "bg-emerald-950 text-emerald-300",
    warn: "bg-amber-950 text-amber-300",
  } as const;
  return (
    <span className={`inline-flex shrink-0 items-center rounded-full px-2.5 py-1 text-xs font-medium ${tones[tone]}`}>
      {children}
    </span>
  );
}

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-dashed border-neutral-800 px-4 py-8 text-center">
      <p className="text-sm text-neutral-400">{title}</p>
      {hint && <p className="mt-1 text-xs text-neutral-600">{hint}</p>}
    </div>
  );
}

export function Skeleton({ lines = 3, className = "", live = true }: { lines?: number; className?: string; live?: boolean }) {
  return (
    <div
      data-testid="skeleton"
      role={live ? "status" : undefined}
      aria-label={live ? "Loading content" : undefined}
      className={`animate-pulse space-y-2 ${className}`}
    >
      {Array.from({ length: Math.max(1, lines) }).map((_, i) => (
        <div
          key={i}
          data-skeleton-bar
          aria-hidden="true"
          className="h-3 rounded bg-neutral-800"
          style={{ width: `${100 - ((i * 17) % 35)}%` }}
        />
      ))}
    </div>
  );
}

export function Tabs<T extends string>({
  options,
  value,
  onChange,
  className = "",
  inert = false,
  label,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (next: T) => void;
  className?: string;
  inert?: boolean;
  label?: string;
}) {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);

  function moveFrom(index: number, key: string) {
    let next = index;
    if (key === "ArrowRight") next = (index + 1) % options.length;
    else if (key === "ArrowLeft") next = (index - 1 + options.length) % options.length;
    else if (key === "Home") next = 0;
    else if (key === "End") next = options.length - 1;
    else return;
    onChange(options[next].value);
    refs.current[next]?.focus();
  }

  // Round 19 item 4: an off-breakpoint tablist stays mounted but hidden via
  // CSS + inert — keeping aria-selected=true there is the twin-tabs smell
  // (two selected tabs exposed at once). While inert, expose every tab as
  // unselected (and untabbable); the internal `value` is untouched so
  // re-show restores the selection exactly.
  const exposed = !inert;
  return (
    <div inert={inert || undefined} className={`flex gap-1 rounded-xl border border-neutral-800 bg-seafoam/70 p-1 w-fit max-w-full overflow-x-auto ${className}`} role="tablist" aria-label={label}>
      {options.map((option, index) => (
        <button
          key={option.value}
          ref={(node) => {
            refs.current[index] = node;
          }}
          role="tab"
          aria-selected={exposed && value === option.value}
          aria-label={label ? `${option.label} (${label})` : undefined}
          tabIndex={exposed && value === option.value ? 0 : -1}
          type="button"
          className={`min-h-11 whitespace-nowrap rounded-lg px-3.5 py-1.5 text-xs font-medium transition-colors ${
            value === option.value
              ? "bg-neutral-900 text-neutral-100 shadow-[0_1px_5px_rgba(6,48,62,0.09)]"
              : "text-neutral-500 hover:text-neutral-200"
          }`}
          onClick={() => onChange(option.value)}
          onKeyDown={(event) => {
            if (["ArrowRight", "ArrowLeft", "Home", "End"].includes(event.key)) {
              event.preventDefault();
              moveFrom(index, event.key);
            }
          }}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export interface BottomNavItem<T extends string> {
  value: T;
  label: string;
  icon?: ReactNode;
}

export function BottomNav<T extends string>({
  label,
  items,
  value,
  onChange,
  className = "",
  inert = false,
}: {
  label: string;
  items: BottomNavItem<T>[];
  value: T;
  onChange: (next: T) => void;
  className?: string;
  inert?: boolean;
}) {
  return (
    <nav
      aria-label={label}
      inert={inert || undefined}
      className={`safe-bottom z-30 grid border-t border-neutral-800 bg-neutral-900/95 p-2 shadow-[0_-10px_30px_rgba(6,48,62,0.08)] backdrop-blur ${className}`}
      style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}
    >
      {items.map((item) => {
        const active = item.value === value;
        return (
          <button
            key={item.value}
            type="button"
            aria-current={active ? "page" : undefined}
            className={`min-h-11 rounded-xl px-2 py-1.5 text-xs font-semibold transition-colors ${
              active
                ? "bg-neutral-100 text-neutral-950"
                : "text-neutral-500 hover:bg-neutral-800 hover:text-neutral-200"
            }`}
            onClick={() => onChange(item.value)}
          >
            <span className="flex items-center justify-center gap-1.5">
              {item.icon}
              <span>{item.label}</span>
            </span>
          </button>
        );
      })}
    </nav>
  );
}

export function StickyActionBar({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`safe-bottom sticky bottom-0 z-20 flex min-h-14 items-center justify-end gap-2 border-t border-neutral-800 bg-neutral-900/95 px-3 py-2 backdrop-blur ${className}`}
    >
      {children}
    </div>
  );
}

export function SwipeRow({
  children,
  actions,
  actionLabel = "Row actions",
  actionWidth = 112,
  className = "",
  hideToggleOnDesktop = false,
}: {
  children: ReactNode;
  actions: ReactNode;
  actionLabel?: string;
  actionWidth?: number;
  className?: string;
  hideToggleOnDesktop?: boolean;
}) {
  const reducedMotion = usePrefersReducedMotion();
  const [open, setOpen] = useState(false);
  const [dragOffset, setDragOffset] = useState<number | null>(null);
  const dragStart = useRef<{ x: number; y: number } | null>(null);
  // True once a horizontal drag passed the capture threshold for this gesture.
  const swiping = useRef(false);
  // Pointer id we captured, if any — released on pointer end.
  const capturedId = useRef<number | null>(null);
  const CAPTURE_THRESHOLD = 12;

  function tryCapture(target: EventTarget | null, pointerId: number) {
    if (capturedId.current !== null) return;
    const el = target as HTMLElement | null;
    if (!el || typeof el.setPointerCapture !== "function") return;
    try {
      if (typeof el.hasPointerCapture === "function" && el.hasPointerCapture(pointerId)) {
        capturedId.current = pointerId;
        return;
      }
      el.setPointerCapture(pointerId);
      capturedId.current = pointerId;
    } catch {
      // Best-effort: some browsers throw NotFoundError for mouse pointers.
      // Swipe tracking works without capture, so never break the gesture.
    }
  }

  function tryRelease(target: EventTarget | null, pointerId: number) {
    if (capturedId.current === null) return;
    capturedId.current = null;
    const el = target as HTMLElement | null;
    if (!el || typeof el.releasePointerCapture !== "function") return;
    try {
      if (typeof el.hasPointerCapture === "function" && !el.hasPointerCapture(pointerId)) return;
      el.releasePointerCapture(pointerId);
    } catch {
      // Ignore — the pointer is gone or was never captured.
    }
  }

  function pointerDown(event: PointerEvent<HTMLDivElement>) {
    dragStart.current = { x: event.clientX, y: event.clientY };
    swiping.current = false;
    // Deliberately no setPointerCapture here: capturing on pointerdown
    // retargets the pointer to the surface, so clicks on inner controls
    // (title, Read, Delete) never fire for mouse/touch.
  }

  function pointerMove(event: PointerEvent<HTMLDivElement>) {
    if (dragStart.current === null) return;
    const dx = event.clientX - dragStart.current.x;
    const dy = event.clientY - dragStart.current.y;
    if (!swiping.current) {
      // Only engage the swipe (and capture the pointer) once a clear
      // horizontal drag exceeds the threshold; taps and vertical scrolls
      // must leave inner controls and scrolling untouched.
      if (Math.abs(dx) < CAPTURE_THRESHOLD || Math.abs(dy) > Math.abs(dx)) return;
      swiping.current = true;
      tryCapture(event.currentTarget, event.pointerId);
    }
    const origin = open ? -actionWidth : 0;
    const next = Math.max(-actionWidth, Math.min(0, origin + dx));
    setDragOffset(next);
  }

  function pointerEnd(event: PointerEvent<HTMLDivElement>) {
    const start = dragStart.current;
    tryRelease(event.currentTarget, event.pointerId);
    swiping.current = false;
    if (start === null) return;
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    if (Math.abs(dy) > Math.abs(dx)) {
      dragStart.current = null;
      setDragOffset(null);
      return;
    }
    if (dx <= -56) setOpen(true);
    else if (dx >= 56) setOpen(false);
    else if (dragOffset !== null) setOpen(Math.abs(dragOffset) > actionWidth / 2);
    dragStart.current = null;
    setDragOffset(null);
  }

  const offset = dragOffset ?? (open ? -actionWidth : 0);
  const revealed = open || dragOffset !== null;
  return (
    <div className={`relative overflow-hidden rounded-xl ${className}`}>
      {/* Round 24 item 1: swipe actions mount ONLY when revealed. The old
          hidden-but-mounted copy (aria-hidden + inert + visibility:hidden)
          shared accessible names with the visible inline Delete/Confirm
          (SR rotor noise, automation traps). Closed rows expose no twin. */}
      {revealed && (
        <div
          role="group"
          aria-label={actionLabel}
          data-testid="swipe-row-actions"
          className="absolute inset-y-0 right-0 flex items-stretch justify-end gap-1 p-1"
          style={{ width: actionWidth }}
        >
          {actions}
        </div>
      )}
      <div
        data-testid="swipe-row-surface"
        className={`relative flex min-h-11 items-center gap-2 bg-neutral-900 ${
          reducedMotion ? "" : "transition-transform duration-200 ease-out"
        }`}
        style={{ transform: `translateX(${offset}px)`, touchAction: "pan-y" }}
        onPointerDown={pointerDown}
        onPointerMove={pointerMove}
        onPointerUp={pointerEnd}
        onPointerCancel={pointerEnd}
      >
        <div className="min-w-0 flex-1">{children}</div>
        <button
          type="button"
          aria-expanded={open}
          aria-label={`${open ? "Hide" : "Show"} ${actionLabel}`}
          title={`${open ? "Hide" : "Show"} ${actionLabel}`}
          className={`min-h-11 min-w-11 shrink-0 rounded-lg px-2 text-base font-semibold text-neutral-500 hover:bg-neutral-800 hover:text-neutral-200 ${hideToggleOnDesktop ? "sm:hidden" : ""}`}
          onClick={() => setOpen((shown) => !shown)}
        >
          <span aria-hidden="true">{open ? "✕" : "⋯"}</span>
        </button>
      </div>
    </div>
  );
}

export const inputCls =
  "min-h-11 w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-base outline-none transition-colors placeholder:text-neutral-600 focus:border-neutral-400 sm:text-sm";
