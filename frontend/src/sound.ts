/**
 * Staged sound design — offline WebAudio synth, no assets, no network.
 *
 * Rules: ON by default (owner decision; Settings mutes per device via
 * `notaeo:sound`), one shared lazily-created AudioContext (browsers and
 * WKWebView start contexts suspended until a user gesture, so every play
 * resumes first and a one-time gesture listener unlocks audio), and every
 * `play*` is a no-op when muted or when `AudioContext` is unavailable
 * (SSR/tests, old WebViews). Boot + success chimes only for this pass;
 * AI thinking keeps the visual thinking orbs, no looped audio.
 */

const STORAGE_KEY = "notaeo:sound";

export function isSoundEnabled(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) !== "off";
  } catch {
    return true;
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

let shared: AudioContext | null = null;
let unlockArmed = false;

function armUnlockListener(): void {
  if (unlockArmed || typeof window === "undefined" || typeof window.addEventListener !== "function") return;
  unlockArmed = true;
  const unlock = () => {
    if (shared && shared.state === "suspended") {
      shared.resume().catch(() => {
        // Still locked — the next gesture or play() retries.
      });
    }
  };
  window.addEventListener("pointerdown", unlock);
  window.addEventListener("keydown", unlock);
}

function openContext(): AudioContext | null {
  if (shared) return shared;
  const Ctor =
    typeof window !== "undefined"
      ? window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      : undefined;
  if (!Ctor) return null;
  try {
    shared = new Ctor();
  } catch {
    return null;
  }
  armUnlockListener();
  return shared;
}

function context(): AudioContext | null {
  if (!isSoundEnabled()) return null;
  const ctx = openContext();
  if (!ctx) return null;
  if (ctx.state === "suspended") {
    ctx.resume().catch(() => {
      // Locked until a gesture lands; the unlock listener retries then.
    });
  }
  return ctx;
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

/** Soft tick for every button press. Deliberately quiet (0.035 gain) and
 * short (0.06s) so high-traffic controls stay pleasant, not naggy. */
export function playTap(): void {
  const ctx = context();
  if (!ctx) return;
  try {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const now = ctx.currentTime;
    osc.type = "sine";
    osc.frequency.setValueAtTime(880, now);
    osc.frequency.exponentialRampToValueAtTime(660, now + 0.05);
    gain.gain.value = 0.035;
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.06);
  } catch {
    // A partial WebAudio implementation must never break a click.
  }
}

const TAP_SELECTOR =
  "button:not(:disabled), a[href], [role='button']:not([aria-disabled='true']),"
  + " input[type='submit']:not(:disabled), input[type='button']:not(:disabled), summary";

let tapArmed = false;

/** True when a click target should tick (exported for tests). */
export function isTapTarget(target: EventTarget | null): boolean {
  if (typeof Element === "undefined" || !(target instanceof Element)) return false;
  return target.closest(TAP_SELECTOR) !== null;
}

/** One delegated click listener so EVERY button ticks without touching
 * individual call sites. Idempotent; call once at startup. */
export function armTapSounds(): void {
  if (tapArmed || typeof document === "undefined" || typeof document.addEventListener !== "function") return;
  tapArmed = true;
  document.addEventListener("click", (event) => {
    if (isTapTarget(event.target)) playTap();
  });
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
