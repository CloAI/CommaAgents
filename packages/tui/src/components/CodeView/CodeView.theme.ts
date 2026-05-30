import { useMemo } from "react";

import { useTheme } from "../../Theme";

/** Spread-ready style objects for the CodeView component. */
export interface CodeViewTheme {
  /** Root container wrapping the entire code block. */
  readonly root: {
    readonly flexDirection: "column";
    readonly paddingX: number;
  };
  /** Row container for a single line (gutter + code). */
  readonly lineRow: {
    readonly flexDirection: "row";
  };
  /** Line number gutter text style. */
  readonly lineNumber: {
    readonly dimColor: boolean;
    readonly color: string;
  };
  /** Gutter separator gap between line number and code. */
  readonly gutterGap: number;
  /** Fallback text style used while the highlighter is loading. */
  readonly fallback: {
    readonly dimColor: boolean;
  };
}

/**
 * Returns themed style objects for the CodeView component.
 * Consumes global tokens via `useTheme()`.
 */
export function useCodeViewTheme(): CodeViewTheme {
  const tokens = useTheme();

  return useMemo<CodeViewTheme>(
    () => ({
      root: {
        flexDirection: "column",
        paddingX: tokens.spacing.sm,
      },
      lineRow: {
        flexDirection: "row",
      },
      lineNumber: {
        dimColor: tokens.typography.secondaryDim,
        color: tokens.colors.muted,
      },
      gutterGap: tokens.spacing.sm,
      fallback: {
        dimColor: tokens.typography.secondaryDim,
      },
    }),
    [tokens],
  );
}
