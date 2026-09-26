import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

export interface TourStep {
  title: string;
  description: string;
  targets?: string[];
}

interface Props {
  step: TourStep;
  index: number;
  total: number;
  nextLabel?: string;
  onNext: () => void;
  onBack: () => void;
  onSkip: () => void;
  /**
   * Round 20 item 1: the opener, captured synchronously in the click handler
   * (e.currentTarget) BEFORE the open state flips. Mount-time activeElement
   * capture is too late for auto-opened tours (no trigger) and async opens
   * (focus already moved). null = auto-opened, restore to #main-content.
   * undefined (omitted) = legacy mount-time capture fallback.
   */
  trigger?: HTMLElement | null;
}

interface SpotlightRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** Assumed card height for placement (mirrors the old 250px clamp math). */
export const TOUR_CARD_HEIGHT = 250;
/** Gap kept between the spotlight target and the card. */
const TOUR_CARD_GAP = 20;

/**
 * Round 22 item 5: position the tour card offset away from its spotlight
 * target so it never parks on top of (covers the center of) the target —
 * the old below/above-plus-clamp could shove the card over the target at
 * 1280px. Upper-half targets open below, lower-half targets open above;
 * after clamping, a placement covering the target center flips to the other
 * side (tiny viewports where both cover fall back to the preferred side).
 */
export function tourCardPosition(
  spotlight: SpotlightRect | null,
  viewport: { width: number; height: number },
  cardWidth: number,
  cardHeight: number = TOUR_CARD_HEIGHT,
): { left: number; top: number } {
  const left = spotlight
    ? Math.max(16, Math.min(spotlight.left, viewport.width - cardWidth - 16))
    : Math.max(16, (viewport.width - cardWidth) / 2);
  if (!spotlight) {
    return { left, top: Math.max(16, (viewport.height - cardHeight) / 2) };
  }
  const centerX = spotlight.left + spotlight.width / 2;
  const centerY = spotlight.top + spotlight.height / 2;
  const coversCenter = (top: number) =>
    top <= centerY &&
    centerY <= top + cardHeight &&
    left <= centerX &&
    centerX <= left + cardWidth;
  const clampTop = (top: number) =>
    Math.max(16, Math.min(top, Math.max(16, viewport.height - cardHeight - 16)));
  const below = spotlight.top + spotlight.height + TOUR_CARD_GAP;
  const above = spotlight.top - cardHeight - TOUR_CARD_GAP;
  const preferBelow = centerY < viewport.height / 2;
  const first = clampTop(preferBelow ? below : above);
  if (!coversCenter(first)) return { left, top: first };
  const second = clampTop(preferBelow ? above : below);
  if (!coversCenter(second)) return { left, top: second };
  return { left, top: first };
}

export default function FirstRunTour({ step, index, total, nextLabel, onNext, onBack, onSkip, trigger }: Props) {
  const [spotlight, setSpotlight] = useState<SpotlightRect | null>(null);
  const [viewport, setViewport] = useState({ width: window.innerWidth, height: window.innerHeight });
  const nextRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLElement>(null);
  // Captured once on mount so every dismiss path (Next-finish, Skip,
  // Escape, scrim) restores to the element that opened the tour.
  // When `trigger` is provided (even null) it wins: the opener captured
  // synchronously in the click handler BEFORE setOpen. undefined = legacy
  // mount-time activeElement capture.
  const triggerProvided = trigger !== undefined;
  const savedTriggerRef = useRef<HTMLElement | null>(trigger ?? null);

  useEffect(() => {
    let frame = 0;
    const findVisibleTarget = () => step.targets
      ?.flatMap((selector) => Array.from(document.querySelectorAll<HTMLElement>(selector)))
      .find((element) => {
        const bounds = element.getBoundingClientRect();
        return bounds.width > 0 && bounds.height > 0;
      });
    const measure = () => {
      const width = window.innerWidth;
      const height = window.innerHeight;
      setViewport((current) => current.width === width && current.height === height ? current : { width, height });
      const target = findVisibleTarget();
      if (!target) { setSpotlight((current) => current === null ? current : null); return; }
      const bounds = target.getBoundingClientRect();
      const left = Math.max(0, bounds.left - 8);
      const top = Math.max(0, bounds.top - 8);
      const right = Math.min(width, bounds.right + 8);
      const bottom = Math.min(height, bounds.bottom + 8);
      if (right <= left || bottom <= top) { setSpotlight((current) => current === null ? current : null); return; }
      const next = { left, top, width: right - left, height: bottom - top };
      setSpotlight((current) => current && current.left === next.left && current.top === next.top && current.width === next.width && current.height === next.height ? current : next);
    };
    const followTarget = () => {
      measure();
      frame = window.requestAnimationFrame(followTarget);
    };
    const firstTarget = findVisibleTarget();
    firstTarget?.scrollIntoView?.({ block: "nearest", behavior: "smooth" });
    measure();
    if (typeof window.requestAnimationFrame === "function") frame = window.requestAnimationFrame(followTarget);
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [step]);

  useEffect(() => {
    const root = document.getElementById("root");
    if (root) {
      root.setAttribute("inert", "");
      return () => {
        root.removeAttribute("inert");
      };
    }
    const tourRoots = Array.from(document.querySelectorAll('[data-testid="tour-root"]'));
    const targets = Array.from(document.body.children).filter(
      (el) => !tourRoots.some((tour) => tour === el || el.contains(tour)),
    );
    targets.forEach((el) => el.setAttribute("inert", ""));
    return () => {
      targets.forEach((el) => el.removeAttribute("inert"));
    };
  }, []);

  // Declared after the inert effect so that on unmount the inert
  // attribute is removed BEFORE focus is restored — otherwise the
  // trigger is still inert, focus falls back to BODY, and the restore
  // is lost. Mount-only: step changes must not overwrite the trigger.
  useEffect(() => {
    if (!triggerProvided && savedTriggerRef.current === null) {
      const active = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      // An auto-opened tour has no trigger: activeElement is BODY (or nothing
      // focusable). Leave the ref null so dismiss falls back to #main-content.
      savedTriggerRef.current = active && active !== document.body ? active : null;
    }
    nextRef.current?.focus();
    return () => {
      // The opener is fixed for the tour's lifetime (set synchronously
      // before the open state flips), so the mount-closure value is exact.
      const explicit = triggerProvided ? (trigger ?? null) : savedTriggerRef.current;
      // Auto-open path: the captured trigger may be a now-unmounted control
      // (e.g. the register/create input that had focus when the tour opened).
      // Restoring to a disconnected node strands focus on BODY (or a dead
      // input), so only reuse a trigger still connected to the DOM.
      if (explicit && explicit.isConnected && document.contains(explicit)) {
        explicit.focus();
      } else {
        document.getElementById("main-content")?.focus?.();
      }
      savedTriggerRef.current = null;
    };
    // Mount-closure trigger is exact (opener fixed before open flips).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { onSkip(); return; }
      if (event.key !== "Tab") return;
      const buttons = dialogRef.current?.querySelectorAll<HTMLButtonElement>("button:not([disabled])");
      if (!buttons?.length) return;
      const first = buttons[0];
      const last = buttons[buttons.length - 1];
      if (!dialogRef.current?.contains(document.activeElement)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      } else if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, [step, onSkip]);

  const cardWidth = Math.min(360, viewport.width - 32);
  const { left: cardLeft, top: cardTop } = tourCardPosition(spotlight, viewport, cardWidth);

  return createPortal(
    <div data-testid="tour-root" className="pointer-events-none fixed inset-0 z-[100]" role="presentation">
      {spotlight ? (
        <>
          <div data-testid="tour-scrim" onClick={onSkip} className="pointer-events-auto absolute inset-x-0 top-0 bg-brand-deep/70" style={{ height: Math.max(0, spotlight.top) }} aria-hidden="true" />
          <div data-testid="tour-scrim" onClick={onSkip} className="pointer-events-auto absolute left-0 bg-brand-deep/70" style={{ top: spotlight.top, width: Math.max(0, spotlight.left), height: spotlight.height }} aria-hidden="true" />
          <div data-testid="tour-scrim" onClick={onSkip} className="pointer-events-auto absolute right-0 bg-brand-deep/70" style={{ top: spotlight.top, width: Math.max(0, viewport.width - spotlight.left - spotlight.width), height: spotlight.height }} aria-hidden="true" />
          <div data-testid="tour-scrim" onClick={onSkip} className="pointer-events-auto absolute inset-x-0 bottom-0 bg-brand-deep/70" style={{ top: spotlight.top + spotlight.height }} aria-hidden="true" />
          <div
            data-testid="tour-spotlight"
            className="pointer-events-none absolute rounded-2xl border-2 border-aquabright bg-transparent shadow-[0_0_0_8px_rgba(25,184,166,0.2)] transition-all duration-300"
            style={spotlight}
            aria-hidden="true"
          />
        </>
      ) : <div data-testid="tour-scrim" onClick={onSkip} className="pointer-events-auto absolute inset-0 bg-brand-deep/75" aria-hidden="true" />}
      <section
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="tour-title"
        onClick={(event) => event.stopPropagation()}
        className="pointer-events-auto absolute max-h-[calc(100vh-32px)] overflow-y-auto rounded-2xl border border-neutral-700 bg-neutral-900 p-5 text-neutral-100 shadow-[0_24px_70px_rgba(4,34,44,0.3)] animate-pop-in"
        style={{ width: cardWidth, left: cardLeft, top: cardTop }}
      >
        <p className="text-xs font-semibold uppercase tracking-[0.15em] text-aqua">A quick look · {index + 1} of {total}</p>
        <h2 id="tour-title" className="mt-3 font-display text-2xl font-semibold leading-tight">{step.title}</h2>
        <p className="mt-3 text-sm leading-relaxed text-neutral-500">{step.description}</p>
        <p className="mt-2 text-xs text-neutral-600">Tip: press Escape to skip at any time.</p>
        <div className="mt-6 flex items-center justify-between gap-3">
          <button type="button" className="min-h-11 rounded-lg px-3 text-sm text-neutral-500 hover:text-neutral-100" onClick={onSkip}>Skip tour</button>
          <div className="flex gap-2">
            {index > 0 && <button type="button" className="min-h-11 rounded-lg border border-neutral-700 px-4 text-sm hover:bg-neutral-800" onClick={onBack}>Back</button>}
            <button ref={nextRef} type="button" className="min-h-11 rounded-lg bg-neutral-100 px-4 text-sm font-medium text-neutral-900 hover:bg-neutral-200" onClick={onNext}>{nextLabel ?? "Next"}</button>
          </div>
        </div>
      </section>
    </div>,
    document.body,
  );
}
