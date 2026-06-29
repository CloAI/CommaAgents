import {
  type BoxProps,
  defineTheme,
  type TextProps,
  type ThemeOf,
} from "../../Theme";

/**
 * Memoized themed style objects for the LogsPage component.
 */
export const useLogsPageTheme = defineTheme((tokens) => ({
  /** Root container (column layout, full height). */
  root: {
    flexDirection: "column",
    flexGrow: 1,
    paddingX: tokens.spacing.sm,
  } satisfies BoxProps,
  /** Single log entry row. */
  logRow: {
    flexDirection: "row",
    gap: tokens.spacing.sm,
  } satisfies BoxProps,
  /** Timestamp text style. */
  timestamp: {
    dimColor: tokens.typography.secondaryDim,
  } satisfies TextProps,
  /** Level badge styles by level. */
  levels: {
    log: { color: tokens.colors.muted } satisfies TextProps,
    info: { color: tokens.colors.primary } satisfies TextProps,
    warn: { color: tokens.colors.warning } satisfies TextProps,
    error: { color: tokens.colors.error } satisfies TextProps,
    debug: {
      dimColor: tokens.typography.secondaryDim,
    } satisfies TextProps,
  },
  /** Log message body. */
  messageBody: {
    wrap: "wrap",
  } satisfies TextProps,
  /** Empty state text. */
  emptyState: {
    dimColor: tokens.typography.secondaryDim,
  } satisfies TextProps,
}));

/** Resolved style object shape returned by {@link useLogsPageTheme}. */
export type LogsPageTheme = ThemeOf<typeof useLogsPageTheme>;
