import { useContext } from "react";

import type { Theme } from "../Theme.types";
import { ThemeContext } from "./useTheme.context";

/**
 * Access the current theme tokens.
 *
 * Returns the `Theme` object from the nearest `<ThemeContextProvider>`,
 * or `defaultTheme` when called outside any provider. The fallback exists
 * primarily so components remain renderable inside the detached
 * `measureLayout` tree, which has no provider chain of its own. Within
 * the live app the provider always wins.
 */
export function useTheme(): Theme {
  return useContext(ThemeContext);
}
