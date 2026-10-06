import { ThinkingOrb } from "thinking-orbs";
import type { OrbSize, OrbState, OrbTheme } from "thinking-orbs";
import { useEffect, useState } from "react";

/**
 * App-themed wrapper around the `thinking-orbs` web original
 * (MIT © Jakub Antalik — see THIRD-PARTY-NOTICES.md).
 *
 * The default ink follows the app's Paper/Ocean/Night theme, including
 * changes made while an indicator is mounted. Explicit theme overrides
 * support contrasting button fills. OS color scheme is independent of the
 * app's saved appearance.
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

export default function ThinkingDots({ state = "working", size = 20, label, className = "", speed = 1, theme }: Props) {
  const [surfaceTheme, setSurfaceTheme] = useState<OrbTheme>(() =>
    typeof document !== "undefined" && document.documentElement.dataset.theme === "night" ? "dark" : "light",
  );
  useEffect(() => {
    if (theme !== undefined) return;
    const root = document.documentElement;
    const update = () => setSurfaceTheme(root.dataset.theme === "night" ? "dark" : "light");
    update();
    const observer = new MutationObserver(update);
    observer.observe(root, { attributes: true, attributeFilter: ["data-theme"] });
    return () => observer.disconnect();
  }, [theme]);
  return (
    <ThinkingOrb
      state={state}
      size={size}
      theme={theme ?? surfaceTheme}
      speed={speed}
      aria-label={label ?? THINKING_LABELS[state]}
      className={`shrink-0 ${className}`}
    />
  );
}
