import { useMemo } from "react";

import { useTheme } from "../../theme";

/** Spread-ready style tokens for the `Scrollbar` component. */
export interface ScrollbarTheme {
  /** Thumb foreground color. */
  readonly thumbColor: string;
  /** Track foreground color. */
  readonly trackColor: string;
  /** Single-character glyph used for the thumb. */
  readonly thumbChar: string;
  /** Single-character glyph used for the track. */
  readonly trackChar: string;
}

/**
 * Returns themed style tokens for `Scrollbar`. Consumes global tokens via
 * `useTheme()`.
 */
export function useScrollbarTheme(): ScrollbarTheme {
  const tokens = useTheme();

  return useMemo<ScrollbarTheme>(
    () => ({
      thumbColor: tokens.colors.muted,
      trackColor: tokens.borders.color,
      thumbChar: "\u2588", // Full block.
      trackChar: "\u2502", // Light vertical bar.
    }),
    [tokens],
  );
}
