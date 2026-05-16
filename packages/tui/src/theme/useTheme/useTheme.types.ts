import type { Theme } from "../theme.types";

/** Shape of the theme context value. */
export type ThemeContextType = Theme;

/** Props for `ThemeContextProvider`. */
export interface ThemeContextProviderProps {
  /** Optional theme override. Defaults to `defaultTheme`. */
  readonly theme?: Theme;
  /** Child components that can consume the theme. */
  readonly children: React.ReactNode;
}
