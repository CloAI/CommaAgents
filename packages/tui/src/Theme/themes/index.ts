import type { Theme } from "../Theme.types";
import { darkTheme } from "./dark";
import { draculaTheme } from "./dracula";
import { lightTheme } from "./light";
import { solarizedDarkTheme } from "./solarized-dark";

/** Stable identifier for a built-in theme. */
export type ThemeName = "dark" | "light" | "dracula" | "solarized-dark";

/** Display metadata for a theme registry entry. */
export interface ThemeRegistryEntry {
  /** Stable identifier persisted in the user config. */
  readonly name: ThemeName;
  /** Human-readable label shown in pickers. */
  readonly label: string;
  /** One-line description shown next to the label. */
  readonly description: string;
  /** Resolved theme tokens. */
  readonly theme: Theme;
}

/** All built-in themes, keyed for the settings dropdown. */
export const THEME_REGISTRY: ReadonlyMap<ThemeName, ThemeRegistryEntry> =
  new Map([
    [
      "dark",
      {
        name: "dark",
        label: "Material Dark",
        description: "Material Design 3 dark palette with elevation depth",
        theme: darkTheme,
      },
    ],
    [
      "light",
      {
        name: "light",
        label: "Light",
        description: "Bright background, dark text",
        theme: lightTheme,
      },
    ],
    [
      "dracula",
      {
        name: "dracula",
        label: "Dracula",
        description: "Dark with purple/cyan/pink accents",
        theme: draculaTheme,
      },
    ],
    [
      "solarized-dark",
      {
        name: "solarized-dark",
        label: "Solarized Dark",
        description: "Low-contrast balanced terminal palette",
        theme: solarizedDarkTheme,
      },
    ],
  ]);

/** Default theme name when none is configured. */
export const DEFAULT_THEME_NAME: ThemeName = "dark";

/** Resolve a theme by name, falling back to the default if unknown. */
export function resolveThemeByName(themeName: ThemeName): Theme {
  return (
    THEME_REGISTRY.get(themeName) ?? THEME_REGISTRY.get(DEFAULT_THEME_NAME)!
  ).theme;
}

export { darkTheme, lightTheme, draculaTheme, solarizedDarkTheme };
