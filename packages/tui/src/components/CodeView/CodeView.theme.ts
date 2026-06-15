import {
  type BoxProps,
  defineTheme,
  type TextProps,
  type ThemeOf,
} from "../../Theme";

/** Memoized themed style objects for the `CodeView` component. */
export const useCodeViewTheme = defineTheme((tokens) => ({
  /** Root container wrapping the entire code block. */
  root: {
    flexDirection: "column",
    paddingX: tokens.spacing.sm,
  } satisfies BoxProps,
  /** Row container for a single line (gutter + code). */
  lineRow: {
    flexDirection: "row",
  } satisfies BoxProps,
  /** Line number gutter text style. */
  lineNumber: {
    dimColor: tokens.typography.secondaryDim,
    color: tokens.colors.muted,
  } satisfies TextProps,
  /** Gutter separator gap between line number and code. */
  gutterGap: tokens.spacing.sm,
  /** Fallback text style used while the highlighter is loading. */
  fallback: {
    dimColor: tokens.typography.secondaryDim,
  } satisfies TextProps,
}));

/** Resolved style object shape returned by {@link useCodeViewTheme}. */
export type CodeViewTheme = ThemeOf<typeof useCodeViewTheme>;
