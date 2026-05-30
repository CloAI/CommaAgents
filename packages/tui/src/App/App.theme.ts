import { useMemo } from "react";

import { useTheme } from "../Theme";
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
  // Note: useTheme() is called here to ensure the App component is wrapped
  // in the ThemeProvider, as these styles rely on global design tokens.
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
