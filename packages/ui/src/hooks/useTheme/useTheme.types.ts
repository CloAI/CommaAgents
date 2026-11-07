import type { SettingsSaveResult } from "../../settings";
import type { Theme, ThemeMode, ThemePalette } from "../../theme";

/** The active theme, the choices available, and how to change them. */
export interface ThemeContextValue {
  /** Theme currently applied. */
  readonly theme: Theme;
  /** Light or dark mode currently applied. */
  readonly mode: ThemeMode;
  /** Colors currently applied. */
  readonly palette: ThemePalette;
  /** Built-in themes followed by custom ones. */
  readonly themes: readonly Theme[];
  /** Switch between light and dark and remember the choice. */
  readonly setMode: (mode: ThemeMode) => SettingsSaveResult;
  /** Select a theme by id and remember the choice. */
  readonly selectTheme: (id: string) => SettingsSaveResult;
  /** Add or replace a custom theme and select it. */
  readonly saveCustomTheme: (theme: Theme) => SettingsSaveResult;
  /** Remove a custom theme; Comma is selected if it was active. */
  readonly deleteCustomTheme: (id: string) => SettingsSaveResult;
}
