import type { ReviewRating } from "../../api";

/** Minimum horizontal travel (px) for a swipe to count as a grade. */
export const SWIPE_THRESHOLD = 80;

export interface SwipeOptions {
  threshold?: number;
  hasSelection?: boolean;
}

/**
 * Maps a finished pointer drag to a persisted review grade.
 * Returns null when the gesture must not grade: short drags, mostly-vertical
 * drags (scroll protection), or an active text selection.
 */
export function decideSwipe(dx: number, dy: number, opts: SwipeOptions = {}): ReviewRating | null {
  if (opts.hasSelection) return null;
  const threshold = opts.threshold ?? SWIPE_THRESHOLD;
  if (Math.abs(dy) > Math.abs(dx)) return null;
  if (dx >= threshold) return "good";
  if (dx <= -threshold) return "again";
  return null;
}
