import { useContext } from "react";
import { ThemeContext } from "./useTheme.context";
import type { ThemeContextValue } from "./useTheme.types";

/**
 * Read the active theme and change it from within ThemeProvider.
 * @returns {ThemeContextValue} The active theme context.
 */
export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within ThemeProvider.");
  }
  return context;
}
