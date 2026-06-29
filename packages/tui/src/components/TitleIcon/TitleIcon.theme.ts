import {
  type BoxProps,
  defineTheme,
  type TextProps,
  type ThemeOf,
} from "../../Theme";

/**
 * Memoized themed style objects for the TitleIcon component.
 */
export const useTitleIconTheme = defineTheme((tokens) => ({
  /** Outer container wrapping the ASCII art. */
  container: {
    flexDirection: "column",
    alignItems: "center",
    paddingY: tokens.spacing.xs,
  } satisfies BoxProps,
  /** Each line of the ASCII frame. */
  frameLine: {
    color: tokens.colors.primary,
    dimColor: false,
  } satisfies TextProps,
}));

/** Resolved style object shape returned by {@link useTitleIconTheme}. */
export type TitleIconTheme = ThemeOf<typeof useTitleIconTheme>;
