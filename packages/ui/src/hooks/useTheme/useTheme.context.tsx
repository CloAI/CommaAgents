import { createContext, useCallback, useLayoutEffect, useMemo } from "react";
import type { ReactNode } from "react";
import {
  DEFAULT_APPEARANCE,
  activeTheme,
  allThemes,
  applyTheme,
  paletteFor,
} from "../../theme";
import type { AppearanceSettings, Theme, ThemeMode } from "../../theme";
import { DEFAULT_THEME_ID } from "../../theme/theme.constants";
import { useSettings } from "../useSettings";
import type { ThemeContextValue } from "./useTheme.types";

export const ThemeContext = createContext<ThemeContextValue | null>(null);

/** Application content that follows the saved theme. */
export interface ThemeProviderProps {
  /** Components sharing the active theme. */
  readonly children: ReactNode;
}

/**
 * Apply the saved theme to the document and expose ways to change it.
 * @param {ThemeProviderProps} props - Application content.
 * @returns {React.ReactElement} The shared theme provider.
 */
export function ThemeProvider({ children }: ThemeProviderProps) {
  const { settings, saveSettings } = useSettings();
  const appearance = settings.appearance ?? DEFAULT_APPEARANCE;
  const theme = activeTheme(appearance);
  const palette = paletteFor(theme, appearance.mode);
  useLayoutEffect(() => {
    applyTheme(document.documentElement, palette, appearance.mode);
  }, [palette, appearance.mode]);
  const update = useCallback(
    (next: AppearanceSettings) =>
      saveSettings({ ...settings, appearance: next }),
    [settings, saveSettings],
  );
  const value = useMemo<ThemeContextValue>(
    () => ({
      theme,
      mode: appearance.mode,
      palette,
      themes: allThemes(appearance),
      setMode: (mode: ThemeMode) => update({ ...appearance, mode }),
      selectTheme: (id: string) => update({ ...appearance, themeId: id }),
      saveCustomTheme: (custom: Theme) =>
        update({
          ...appearance,
          themeId: custom.id,
          customThemes: [
            ...appearance.customThemes.filter(
              (entry) => entry.id !== custom.id,
            ),
            custom,
          ],
        }),
      deleteCustomTheme: (id: string) =>
        update({
          ...appearance,
          themeId:
            appearance.themeId === id ? DEFAULT_THEME_ID : appearance.themeId,
          customThemes: appearance.customThemes.filter(
            (entry) => entry.id !== id,
          ),
        }),
    }),
    [theme, palette, appearance, update],
  );
  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}
