import { useMemo } from "react";

import { useTheme } from "../theme";
import type { AppTheme } from "./App.types";

/**
 * Returns themed style objects for the App component.
 * Consumes global tokens via `useTheme()`.
 *
 * @example
 * ```tsx
 * const theme = useAppTheme();
 * return <div style={theme.root}>...</div>;
 * ```
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
