import {
  type BoxProps,
  defineTheme,
  type TextProps,
  type ThemeOf,
} from "../../../theme";

/**
 * Memoized themed style objects for the {@link OutputModal} component.
 *
 * Sized to fit the existing `Modal` chrome — the OutputModal renders
 * inside a `Modal`, so this theme covers the body shell + search bar
 * + line list, not the surrounding overlay.
 */
export const useOutputModalTheme = defineTheme((tokens) => ({
  body: {
    flexDirection: "column",
    width: "100%",
    minHeight: 20,
    flexGrow: 1,
    overflow: "hidden",
  } satisfies BoxProps,
  searchRow: {
    flexDirection: "row",
    flexShrink: 0,
  } satisfies BoxProps,
  statusRow: {
    flexDirection: "row",
    flexShrink: 0,
    marginBottom: tokens.spacing.xs,
  } satisfies BoxProps,
  /** Style of the trailing "N matches" / "no matches" status text. */
  searchStatus: {
    color: tokens.colors.muted,
    dimColor: tokens.typography.secondaryDim,
  } satisfies TextProps,
  /** Style applied when the user-typed regex fails to compile. */
  searchStatusError: {
    color: tokens.colors.error,
  } satisfies TextProps,
  /** Container around the rendered (possibly filtered) line list. */
  lineList: {
    flexDirection: "column",
    flexGrow: 1,
    overflow: "hidden",
  } satisfies BoxProps,
  /** Single line row container. */
  lineRow: {
    flexDirection: "row",
  } satisfies BoxProps,
  /** Faint left-gutter line number. */
  lineNumber: {
    color: tokens.colors.muted,
    dimColor: tokens.typography.secondaryDim,
  } satisfies TextProps,
  /** Default text style for non-matching segments. */
  lineText: {
    color: tokens.colors.primary,
  } satisfies TextProps,
  /** Inverted highlight applied to matching segments. */
  lineMatch: {
    color: tokens.colors.background,
    backgroundColor: tokens.colors.warning,
    bold: true,
  } satisfies TextProps,
  /** Style of the empty-state row when the query matches nothing. */
  emptyState: {
    color: tokens.colors.muted,
    dimColor: tokens.typography.secondaryDim,
    italic: true,
  } satisfies TextProps,
}));

/** Resolved style object shape returned by {@link useOutputModalTheme}. */
export type OutputModalTheme = ThemeOf<typeof useOutputModalTheme>;
