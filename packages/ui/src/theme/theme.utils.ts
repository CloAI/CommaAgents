import { CUSTOM_THEME_PREFIX, THEME_COLOR_FIELDS } from "./theme.constants";
import { BUILT_IN_THEMES, COMMA_THEME } from "./presets";
import { THEME_COLOR_KEYS } from "./theme.types";
import type {
  AppearanceSettings,
  Theme,
  ThemeColorKey,
  ThemeMode,
  ThemePalette,
} from "./theme.types";

/**
 * Check that a color is a six-digit hex value, the form color inputs produce.
 * @param {string} value - Candidate color.
 * @returns {boolean} Whether the value is `#rrggbb`.
 */
export function isHexColor(value: string): boolean {
  return /^#[0-9a-f]{6}$/i.test(value);
}

/**
 * Validate a decoded palette: every color present and a hex string.
 * @param {unknown} value - Decoded browser data.
 * @returns {boolean} Whether the value is a complete palette.
 */
export function isThemePalette(value: unknown): value is ThemePalette {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  return THEME_COLOR_KEYS.every((key) => {
    const color = Object.entries(value).find(([name]) => name === key)?.[1];
    return typeof color === "string" && isHexColor(color);
  });
}

/**
 * Validate a decoded custom theme.
 * @param {unknown} value - Decoded browser data.
 * @returns {boolean} Whether the value is a theme.
 */
export function isTheme(value: unknown): value is Theme {
  return (
    typeof value === "object" &&
    value !== null &&
    "id" in value &&
    typeof value.id === "string" &&
    value.id.startsWith(CUSTOM_THEME_PREFIX) &&
    "name" in value &&
    typeof value.name === "string" &&
    value.name.trim() !== "" &&
    "dark" in value &&
    isThemePalette(value.dark) &&
    "light" in value &&
    isThemePalette(value.light)
  );
}

/**
 * Validate decoded appearance settings.
 * @param {unknown} value - Decoded browser data.
 * @returns {boolean} Whether the value has the supported shape.
 */
export function isAppearanceSettings(
  value: unknown,
): value is AppearanceSettings {
  return (
    typeof value === "object" &&
    value !== null &&
    "themeId" in value &&
    typeof value.themeId === "string" &&
    "mode" in value &&
    (value.mode === "dark" || value.mode === "light") &&
    "customThemes" in value &&
    Array.isArray(value.customThemes) &&
    value.customThemes.every(isTheme)
  );
}

/**
 * List built-in themes followed by the user's own.
 * @param {AppearanceSettings} appearance - Saved appearance.
 * @returns {readonly Theme[]} Every selectable theme.
 */
export function allThemes(appearance: AppearanceSettings): readonly Theme[] {
  return [...BUILT_IN_THEMES, ...appearance.customThemes];
}

/**
 * Find the selected theme, falling back to Comma when it no longer exists.
 * @param {AppearanceSettings} appearance - Saved appearance.
 * @returns {Theme} The active theme.
 */
export function activeTheme(appearance: AppearanceSettings): Theme {
  return (
    allThemes(appearance).find((theme) => theme.id === appearance.themeId) ??
    COMMA_THEME
  );
}

/**
 * Pick the palette for a mode.
 * @param {Theme} theme - Theme to read.
 * @param {ThemeMode} mode - Light or dark.
 * @returns {ThemePalette} The mode's colors.
 */
export function paletteFor(theme: Theme, mode: ThemeMode): ThemePalette {
  return mode === "dark" ? theme.dark : theme.light;
}

/**
 * Replace one mode's palette in a theme.
 * @param {Theme} theme - Theme to copy.
 * @param {ThemeMode} mode - Mode to replace.
 * @param {ThemePalette} palette - New colors.
 * @returns {Theme} The updated theme.
 */
export function withPalette(
  theme: Theme,
  mode: ThemeMode,
  palette: ThemePalette,
): Theme {
  return mode === "dark"
    ? { ...theme, dark: palette }
    : { ...theme, light: palette };
}

/**
 * Change one color in a palette.
 * @param {ThemePalette} palette - Palette to copy.
 * @param {ThemeColorKey} key - Color to change.
 * @param {string} color - New `#rrggbb` value.
 * @returns {ThemePalette} The updated palette.
 */
export function withColor(
  palette: ThemePalette,
  key: ThemeColorKey,
  color: string,
): ThemePalette {
  return { ...palette, [key]: color };
}

/**
 * Turn a palette into the CSS custom properties styles read.
 *
 * Each color is written twice: as its live variable and as a `--base-` copy that
 * per-pane hue shifts can derive from without referring to themselves.
 * @param {ThemePalette} palette - Colors to expose.
 * @returns {Readonly<Record<string, string>>} Property name to value.
 */
export function themeCssVariables(
  palette: ThemePalette,
): Readonly<Record<string, string>> {
  const variables: Record<string, string> = {};
  for (const key of THEME_COLOR_KEYS) {
    const { cssVariable } = THEME_COLOR_FIELDS[key];
    variables[cssVariable] = palette[key];
    variables[cssVariable.replace(/^--/, "--base-")] = palette[key];
  }
  return variables;
}

/**
 * Apply a palette and mode to the document.
 * @param {HTMLElement} root - Element carrying the variables, normally `<html>`.
 * @param {ThemePalette} palette - Colors to show.
 * @param {ThemeMode} mode - Native control and scrollbar scheme.
 * @returns {void}
 */
export function applyTheme(
  root: HTMLElement,
  palette: ThemePalette,
  mode: ThemeMode,
): void {
  for (const [name, value] of Object.entries(themeCssVariables(palette))) {
    root.style.setProperty(name, value);
  }
  root.style.colorScheme = mode;
}

/**
 * Copy a theme under a new id and name, so it can be edited.
 * @param {Theme} theme - Theme to copy.
 * @param {string} id - New custom id.
 * @param {string} name - New display name.
 * @returns {Theme} An independent custom theme.
 */
export function cloneTheme(theme: Theme, id: string, name: string): Theme {
  return { id, name, dark: { ...theme.dark }, light: { ...theme.light } };
}

/**
 * Check whether an id belongs to a user-created theme.
 * @param {string} id - Theme id.
 * @returns {boolean} Whether the theme is custom.
 */
export function isCustomThemeId(id: string): boolean {
  return id.startsWith(CUSTOM_THEME_PREFIX);
}
