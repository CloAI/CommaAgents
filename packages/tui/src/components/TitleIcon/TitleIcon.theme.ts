import { useMemo } from "react";

import { useTheme } from "../../Theme";

/** Spread-ready style objects for the TitleIcon component. */
export interface TitleIconTheme {
  /** Outer container wrapping the ASCII art. */
  readonly container: {
    readonly flexDirection: "column";
    readonly alignItems: "center";
    readonly paddingY: number;
  };
  /** Each line of the ASCII frame. */
  readonly frameLine: {
    readonly color: string;
    readonly dimColor: boolean;
  };
}

/**
 * Returns themed style objects for the TitleIcon component.
 * Consumes global tokens via `useTheme()`.
 */
export function useTitleIconTheme(): TitleIconTheme {
  const tokens = useTheme();

  return useMemo<TitleIconTheme>(
    () => ({
      container: {
        flexDirection: "column",
        alignItems: "center",
        paddingY: tokens.spacing.xs,
      },
      frameLine: {
        color: tokens.colors.primary,
        dimColor: false,
      },
    }),
    [tokens],
  );
}
