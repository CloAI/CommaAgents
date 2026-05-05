import { useMemo } from "react";

import { useTheme } from "../../theme";

/** Spread-ready style objects for the LogsPage component. */
export interface LogsPageTheme {
  /** Root container (column layout, full height). */
  readonly root: {
    readonly flexDirection: "column";
    readonly flexGrow: number;
    readonly paddingX: number;
  };
  /** Single log entry row. */
  readonly logRow: {
    readonly flexDirection: "row";
    readonly gap: number;
  };
  /** Timestamp text style. */
  readonly timestamp: {
    readonly dimColor: boolean;
  };
  /** Level badge styles by level. */
  readonly levels: {
    readonly log: { readonly color: string };
    readonly info: { readonly color: string };
    readonly warn: { readonly color: string };
    readonly error: { readonly color: string };
    readonly debug: { readonly dimColor: boolean };
  };
  /** Log message body. */
  readonly messageBody: {
    readonly wrap: "wrap";
  };
  /** Empty state text. */
  readonly emptyState: {
    readonly dimColor: boolean;
  };
}

/**
 * Returns themed style objects for the LogsPage component.
 * Consumes global tokens via `useTheme()`.
 */
export function useLogsPageTheme(): LogsPageTheme {
  const tokens = useTheme();

  return useMemo<LogsPageTheme>(
    () => ({
      root: {
        flexDirection: "column",
        flexGrow: 1,
        paddingX: tokens.spacing.sm,
      },
      logRow: {
        flexDirection: "row",
        gap: tokens.spacing.sm,
      },
      timestamp: {
        dimColor: tokens.typography.secondaryDim,
      },
      levels: {
        log: { color: tokens.colors.muted },
        info: { color: tokens.colors.primary },
        warn: { color: tokens.colors.warning },
        error: { color: tokens.colors.error },
        debug: { dimColor: tokens.typography.secondaryDim },
      },
      messageBody: {
        wrap: "wrap",
      },
      emptyState: {
        dimColor: tokens.typography.secondaryDim,
      },
    }),
    [tokens],
  );
}
