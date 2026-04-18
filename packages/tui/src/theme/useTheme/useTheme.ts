import { useContext } from "react";

import type { Theme } from "../theme.types";
import { ThemeContext } from "./useTheme.context";

/**
 * Access the current theme tokens.
 *
 * Returns the `Theme` object from the nearest `<ThemeProvider>`.
 * Falls back to `defaultTheme` if no provider is present.
 */
export function useTheme(): Theme {
  return useContext(ThemeContext);
}
