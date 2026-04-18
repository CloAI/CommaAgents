import { createContext, useMemo } from "react";

import { defaultTheme } from "../theme";
import type { Theme } from "../theme.types";
import type { ThemeProviderProps } from "./useTheme.types";

export const ThemeContext = createContext<Theme>(defaultTheme);

/**
 * Provides design tokens to descendant components and theme hooks.
 *
 * @param props - Theme provider configuration including optional theme override.
 * @example
 * ```tsx
 * <ThemeProvider theme={customTheme}>
 *   <App />
 * </ThemeProvider>
 * ```
 */
export function ThemeProvider(props: ThemeProviderProps) {
  const { theme, children } = props;
  const resolved = useMemo(() => theme ?? defaultTheme, [theme]);
  return <ThemeContext.Provider value={resolved}>{children}</ThemeContext.Provider>;
}
