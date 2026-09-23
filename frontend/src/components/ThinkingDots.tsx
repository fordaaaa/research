import { ThinkingOrb } from "thinking-orbs";
import type { OrbSize, OrbState, OrbTheme } from "thinking-orbs";

/**
 * App-themed wrapper around the `thinking-orbs` web original
 * (MIT © Jakub Antalik — see THIRD-PARTY-NOTICES.md).
 *
 * Theme: this app is light-first (seafoam page `#edf5f1`, `--color-seafoam`;
 * see `src/index.css`), so the default is `theme="light"` (dark ink
 * dots). Primary buttons need `theme="dark"` (light ink). `auto` is not used:
 * it falls back to the OS
 * `prefers-color-scheme`, which would render light-ink dots on our light
 * background for dark-mode OS users. No new palette is introduced — the
 * library's own monochrome ink is the themed choice.
 *
 * Motion: the library already honors `prefers-reduced-motion` internally
 * (renders a static representative frame, still following the theme), pauses
 * offscreen instances via `IntersectionObserver`, and exposes `role="img"`
 * with per-state labels — so no extra motion handling is added here. The
 * app-wide CSS in `index.css` additionally collapses animation durations
 * under `prefers-reduced-motion: reduce`.
 */
const THINKING_LABELS: Record<OrbState, string> = {
  working: "AI is thinking…",
  searching: "Searching…",
  solving: "Reasoning…",
  listening: "Listening…",
  connecting: "Connecting…",
  weaving: "Gathering…",
  composing: "Writing…",
  breathing: "Working…",
  shaping: "Forming…",
};

interface Props {
  /** Which orb animation to show. @default "working" */
  state?: OrbState;
  /** Tuned preset — 64 (avatar/standalone) or 20 (inline). @default 20 */
  size?: OrbSize;
  /** Overrides the per-state default screen-reader label. */
  label?: string;
  className?: string;
  speed?: number;
  /** Use dark on deep-sea primary buttons; light on page and card surfaces. */
  theme?: OrbTheme;
}

export default function ThinkingDots({ state = "working", size = 20, label, className = "", speed = 1, theme = "light" }: Props) {
  return (
    <ThinkingOrb
      state={state}
      size={size}
      theme={theme}
      speed={speed}
      aria-label={label ?? THINKING_LABELS[state]}
      className={`shrink-0 ${className}`}
    />
  );
}
