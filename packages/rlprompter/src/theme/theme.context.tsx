import { createContext, type ReactNode, useContext } from "react";
import { darkTheme } from "./dark";
import type { Theme } from "./theme.types";

const ThemeContext = createContext<Theme>(darkTheme);

/** Provides theme tokens to descendant components. */
export function ThemeProvider({
  theme = darkTheme,
  children,
}: {
  readonly theme?: Theme;
  readonly children: ReactNode;
}) {
  return (
    <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>
  );
}

/** Access the current theme tokens. */
export function useTheme(): Theme {
  return useContext(ThemeContext);
}
