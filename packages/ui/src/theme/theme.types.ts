/** Every color a theme controls, in display order. */
export const THEME_COLOR_KEYS = [
  "canvas",
  "surface",
  "surfaceRaised",
  "codeBackground",
  "border",
  "text",
  "muted",
  "primary",
  "onPrimary",
  "focus",
  "success",
  "warning",
  "onWarning",
  "error",
  "errorText",
  "comment",
  "keyword",
  "string",
  "number",
  "function",
  "attribute",
  "type",
  "variable",
  "tag",
  "operator",
  "meta",
] as const;

/** Name of one themeable color. */
export type ThemeColorKey = (typeof THEME_COLOR_KEYS)[number];

/** A complete set of `#rrggbb` colors for one light or dark appearance. */
export type ThemePalette = Readonly<Record<ThemeColorKey, string>>;

/** Whether the interface is light or dark. */
export type ThemeMode = "dark" | "light";

/** A named theme with a palette for each mode. */
export interface Theme {
  /** Stable identifier; custom themes start with `custom-`. */
  readonly id: string;
  /** Name shown in the theme list. */
  readonly name: string;
  /** Colors used in dark mode. */
  readonly dark: ThemePalette;
  /** Colors used in light mode. */
  readonly light: ThemePalette;
}

/** Saved appearance choices. */
export interface AppearanceSettings {
  /** Selected theme id, built in or custom. */
  readonly themeId: string;
  /** Selected light or dark mode. */
  readonly mode: ThemeMode;
  /** Themes the user created in this browser. */
  readonly customThemes: readonly Theme[];
}

/** Where a color appears in the interface. */
export type ThemeColorGroup = "App" | "Status" | "Syntax";

/** How one color is labeled, grouped, and exposed to styles. */
export interface ThemeColorField {
  /** Label in the theme editor. */
  readonly label: string;
  /** Editor section. */
  readonly group: ThemeColorGroup;
  /** CSS custom property that carries the color. */
  readonly cssVariable: string;
  /** What the color is used for. */
  readonly description: string;
}
