import {
  type BoxProps,
  defineTheme,
  type TextProps,
  type ThemeOf,
} from "../../../Theme";

/**
 * Memoized themed style objects for the {@link ToolCallView} component.
 *
 * Every nested object is a spread-ready literal sized to be applied
 * directly to an Ink `<Box>` or `<Text>` — the consumer never reaches in
 * to mutate or re-derive styles, which keeps the render path branch-free
 * and makes snapshot diffs predictable.
 */
export const useToolCallViewTheme = defineTheme((tokens) => ({
  /** Outer container — a single column row spaced from the previous segment. */
  container: {
    flexDirection: "column",
    marginTop: tokens.spacing.xs,
  } satisfies BoxProps,
  /** Glyph color when the call is still in flight. */
  runningGlyph: {
    color: tokens.colors.primary,
  } satisfies TextProps,
  /** Glyph color on success. */
  completedGlyph: {
    color: tokens.colors.success,
  } satisfies TextProps,
  /** Glyph color on failure. */
  errorGlyph: {
    color: tokens.colors.error,
  } satisfies TextProps,
  /** Tool name style. */
  toolName: {
    bold: tokens.typography.labelBold,
    color: tokens.colors.primary,
  } satisfies TextProps,
  /** Args preview style. */
  args: {
    dimColor: tokens.typography.secondaryDim,
  } satisfies TextProps,
  /** Result summary (success path). */
  resultSummary: {
    dimColor: tokens.typography.secondaryDim,
  } satisfies TextProps,
  /** Result summary (error path). */
  errorSummary: {
    color: tokens.colors.error,
  } satisfies TextProps,
}));

/** Resolved style object shape returned by {@link useToolCallViewTheme}. */
export type ToolCallViewTheme = ThemeOf<typeof useToolCallViewTheme>;
