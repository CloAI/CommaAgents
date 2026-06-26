import type { ScrollbarGeometry } from "./Scrollbar.types";

/**
 * Compute the thumb position and size for a vertical scrollbar.
 *
 * - When `total <= windowSize` (content fits), the thumb fills the full
 *   track — callers can use this to render a "neutral" scrollbar or hide it
 *   entirely at their discretion.
 * - Thumb height scales proportionally with the visible fraction but is
 *   always at least 1 row.
 * - Thumb top is distributed linearly across the non-thumb slack.
 *
 * Invariants:
 *   - `0 <= thumbTop <= height - thumbHeight`
 *   - `1 <= thumbHeight <= height`
 */
export function computeScrollbarGeometry(params: {
  readonly total: number;
  readonly windowSize: number;
  readonly offset: number;
  readonly height: number;
}): ScrollbarGeometry {
  const { total, windowSize, offset, height } = params;

  if (height <= 0) {
    return { height: 0, thumbTop: 0, thumbHeight: 0 };
  }
  if (total <= 0 || windowSize <= 0 || total <= windowSize) {
    return { height, thumbTop: 0, thumbHeight: height };
  }

  const rawThumbHeight = Math.round((windowSize / total) * height);
  const thumbHeight = Math.max(1, Math.min(height, rawThumbHeight));

  const slack = height - thumbHeight;
  const maxOffset = total - windowSize;
  const clampedOffset = Math.max(0, Math.min(offset, maxOffset));
  const rawThumbTop =
    maxOffset === 0 ? 0 : Math.round((clampedOffset / maxOffset) * slack);
  const thumbTop = Math.max(0, Math.min(slack, rawThumbTop));

  return { height, thumbTop, thumbHeight };
}
