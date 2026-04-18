import type { Theme } from "../theme.types";

/** Props for `ThemeProvider`. */
export interface ThemeProviderProps {
  /** Optional theme override. Defaults to `defaultTheme`. */
  readonly theme?: Theme;
  /** Child components that can consume the theme. */
  readonly children: React.ReactNode;
}
