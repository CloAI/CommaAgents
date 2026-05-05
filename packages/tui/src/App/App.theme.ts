import { useMemo } from "react";

import { useTheme } from "../theme";

/** Spread-ready style objects for the App component. */
export interface AppTheme {
  /** Root container (column layout, full height). */
  readonly root: {
    readonly flexDirection: "column";
    readonly height: "100%";
  };
}

/**
 * Returns themed style objects for the App component.
 * Consumes global tokens via `useTheme()`.
 */
export function useAppTheme(): AppTheme {
  // Reserved for future token-driven app chrome styles.
  useTheme();

  return useMemo<AppTheme>(
    () => ({
      root: {
        flexDirection: "column",
        height: "100%",
      },
    }),
    [],
  );
}
