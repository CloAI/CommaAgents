import { useContext } from "react";

import type { Theme } from "../theme.types";
import { ThemeContext } from "./useTheme.context";

/**
 * Access the current theme tokens.
 *
 * Returns the `Theme` object from the nearest `<ThemeContextProvider>`.
 * Throws if no provider is mounted in the tree.
 */
export function useTheme(): Theme {
  const contextValue = useContext(ThemeContext);
  if (contextValue === null) {
    throw new Error("useTheme must be used within a ThemeContextProvider");
  }
  return contextValue;
}
