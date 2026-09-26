/**
 * Staged sound design — offline WebAudio synth, no assets, no network.
 *
 * Rules: muted by default (no autoplay — browsers block it before a user
 * gesture anyway), persisted per-device toggle (`notaeo:sound`), and every
 * `play*` is a no-op when muted or when `AudioContext` is unavailable
 * (SSR/tests, old WebViews). Boot + success chimes only for this pass;
 * AI thinking keeps the visual thinking orbs, no looped audio.
 */

const STORAGE_KEY = "notaeo:sound";

export function isSoundEnabled(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === "on";
  } catch {
    return false;
  }
}

export function setSoundEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(STORAGE_KEY, enabled ? "on" : "off");
  } catch {
    // Session-only choice when storage is unavailable.
  }
}

type OscillatorType = "sine" | "triangle";

function tone(
  ctx: AudioContext,
  frequency: number,
  startAt: number,
  duration: number,
  type: OscillatorType = "sine",
  gainValue = 0.08,
): void {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.value = frequency;
  gain.gain.value = gainValue;
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(startAt);
  osc.stop(startAt + duration);
}

function openContext(): AudioContext | null {
  const Ctor =
    typeof window !== "undefined"
      ? window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      : undefined;
  if (!Ctor) return null;
  try {
    return new Ctor();
  } catch {
    return null;
  }
}

function context(): AudioContext | null {
  if (!isSoundEnabled()) return null;
  return openContext();
}

/** Short two-note lift for boot / notebook open (after a user gesture). */
export function playBoot(): void {
  const ctx = context();
  if (!ctx) return;
  const now = ctx.currentTime;
  tone(ctx, 392, now, 0.18, "sine");
  tone(ctx, 587.33, now + 0.14, 0.24, "sine", 0.06);
}

/** Single soft confirm for completed exports / saves. */
export function playSuccess(): void {
  const ctx = context();
  if (!ctx) return;
  tone(ctx, 523.25, ctx.currentTime, 0.16, "triangle");
}

/**
 * One-shot preview of the success chime. Bypasses the muted gate on purpose:
 * the Settings preview (and the "Turn on chimes?" nudge) must be audible so
 * the choice is informed even while chimes are still off.
 */
export function previewChime(): void {
  const ctx = openContext();
  if (!ctx) return;
  tone(ctx, 523.25, ctx.currentTime, 0.16, "triangle");
}
