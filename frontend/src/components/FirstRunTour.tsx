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
}

interface SpotlightRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export default function FirstRunTour({ step, index, total, nextLabel, onNext, onBack, onSkip }: Props) {
  const [spotlight, setSpotlight] = useState<SpotlightRect | null>(null);
  const [viewport, setViewport] = useState({ width: window.innerWidth, height: window.innerHeight });
  const nextRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const findVisibleTarget = () => step.targets
      ?.flatMap((selector) => Array.from(document.querySelectorAll<HTMLElement>(selector)))
      .find((element) => {
        const bounds = element.getBoundingClientRect();
        return bounds.width > 0 && bounds.height > 0;
      });
    const measure = () => {
      setViewport({ width: window.innerWidth, height: window.innerHeight });
      const target = findVisibleTarget();
      if (!target) { setSpotlight(null); return; }
      const bounds = target.getBoundingClientRect();
      setSpotlight({ left: bounds.left - 8, top: bounds.top - 8, width: bounds.width + 16, height: bounds.height + 16 });
    };
    const firstTarget = findVisibleTarget();
    firstTarget?.scrollIntoView?.({ block: "nearest", behavior: "smooth" });
    measure();
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [step]);

  useEffect(() => {
    nextRef.current?.focus();
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
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [step, onSkip]);

  const cardWidth = Math.min(360, viewport.width - 32);
  const cardLeft = spotlight
    ? Math.max(16, Math.min(spotlight.left, viewport.width - cardWidth - 16))
    : Math.max(16, (viewport.width - cardWidth) / 2);
  const cardTop = spotlight
    ? Math.max(16, Math.min(
        spotlight.top + spotlight.height + 20 + 230 < viewport.height
          ? spotlight.top + spotlight.height + 20
          : spotlight.top - 250,
        viewport.height - 250,
      ))
    : Math.max(16, (viewport.height - 250) / 2);

  return createPortal(
    <div className="pointer-events-none fixed inset-0 z-[100]" role="presentation">
      {spotlight ? (
        <>
          <div className="pointer-events-auto absolute inset-x-0 top-0 bg-brand-deep/70" style={{ height: Math.max(0, spotlight.top) }} aria-hidden="true" />
          <div className="pointer-events-auto absolute left-0 bg-brand-deep/70" style={{ top: spotlight.top, width: Math.max(0, spotlight.left), height: spotlight.height }} aria-hidden="true" />
          <div className="pointer-events-auto absolute right-0 bg-brand-deep/70" style={{ top: spotlight.top, width: Math.max(0, viewport.width - spotlight.left - spotlight.width), height: spotlight.height }} aria-hidden="true" />
          <div className="pointer-events-auto absolute inset-x-0 bottom-0 bg-brand-deep/70" style={{ top: spotlight.top + spotlight.height }} aria-hidden="true" />
          <div
            data-testid="tour-spotlight"
            className="pointer-events-none absolute rounded-2xl border-2 border-aquabright bg-transparent shadow-[0_0_0_8px_rgba(25,184,166,0.2)] transition-all duration-300"
            style={spotlight}
            aria-hidden="true"
          />
        </>
      ) : <div className="pointer-events-auto absolute inset-0 bg-brand-deep/75" aria-hidden="true" />}
      <section
        ref={dialogRef}
        role="dialog"
        aria-modal="false"
        aria-labelledby="tour-title"
        className="pointer-events-auto absolute max-h-[calc(100vh-32px)] overflow-y-auto rounded-2xl border border-neutral-700 bg-neutral-900 p-5 text-neutral-100 shadow-[0_24px_70px_rgba(4,34,44,0.3)] animate-pop-in"
        style={{ width: cardWidth, left: cardLeft, top: cardTop }}
      >
        <p className="text-xs font-semibold uppercase tracking-[0.15em] text-aqua">A quick look · {index + 1} of {total}</p>
        <h2 id="tour-title" className="mt-3 font-display text-2xl font-semibold leading-tight">{step.title}</h2>
        <p className="mt-3 text-sm leading-relaxed text-neutral-500">{step.description}</p>
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
