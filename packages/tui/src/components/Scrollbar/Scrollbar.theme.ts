import { defineTheme, type ThemeOf } from "../../Theme";

/**
 * Memoized themed style tokens for the `Scrollbar` component.
 */
export const useScrollbarTheme = defineTheme((tokens) => ({
  /** Thumb foreground color. */
  thumbColor: tokens.colors.muted,
  /** Track foreground color. */
  trackColor: tokens.borders.color,
  /** Single-character glyph used for the thumb. */
  thumbChar: "\u2588",
  /** Single-character glyph used for the track. */
  trackChar: "\u2502",
}));

/** Resolved style token shape returned by {@link useScrollbarTheme}. */
export type ScrollbarTheme = ThemeOf<typeof useScrollbarTheme>;
