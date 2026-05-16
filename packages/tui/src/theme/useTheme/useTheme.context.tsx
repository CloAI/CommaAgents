import { createContext, useMemo } from "react";

import { useUserConfig } from "../../hooks/useUserConfig";
import type { Theme } from "../theme.types";
import { resolveThemeByName } from "../themes";
import type {
  ThemeContextProviderProps,
  ThemeContextType,
} from "./useTheme.types";

export const ThemeContext = createContext<ThemeContextType | null>(null);

/**
 * Provides design tokens to descendant components and theme hooks.
 *
 * When `theme` is supplied, it wins. Otherwise the active theme is read
 * from `useUserConfig` so the dropdown in the command palette settings
 * page can switch themes globally without prop drilling. Must therefore
 * be mounted *inside* a `<UserConfigContextProvider>` when no explicit
 * `theme` is passed.
 *
 * @param props - Theme provider configuration including optional theme override.
 * @example
 * ```tsx
 * <UserConfigContextProvider>
 *   <ThemeContextProvider>
 *     <App />
 *   </ThemeContextProvider>
 * </UserConfigContextProvider>
 * ```
 */
export function ThemeContextProvider({
  theme,
  children,
}: ThemeContextProviderProps) {
  const { config } = useUserConfig();
  const resolved: Theme = useMemo(
    () => theme ?? resolveThemeByName(config.themeName),
    [theme, config.themeName],
  );
  const value = useMemo(() => resolved, [resolved]);
  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}
