import type {
  AppearanceSettings,
  ThemeColorField,
  ThemeColorGroup,
  ThemeColorKey,
} from "./theme.types";

/** Editor sections in display order. */
export const THEME_COLOR_GROUPS: readonly ThemeColorGroup[] = [
  "App",
  "Status",
  "Syntax",
];

/** Label, section, and CSS variable for every themeable color. */
export const THEME_COLOR_FIELDS: Readonly<
  Record<ThemeColorKey, ThemeColorField>
> = {
  canvas: {
    label: "Canvas",
    group: "App",
    cssVariable: "--color-canvas",
    description: "Page and chat background.",
  },
  surface: {
    label: "Surface",
    group: "App",
    cssVariable: "--color-surface",
    description: "Sidebar, bars, and dialogs.",
  },
  surfaceRaised: {
    label: "Raised surface",
    group: "App",
    cssVariable: "--color-surface-raised",
    description: "Hovered and elevated elements.",
  },
  codeBackground: {
    label: "Code background",
    group: "App",
    cssVariable: "--color-code-background",
    description: "Code blocks.",
  },
  border: {
    label: "Border",
    group: "App",
    cssVariable: "--color-border",
    description: "Dividers and outlines.",
  },
  text: {
    label: "Text",
    group: "App",
    cssVariable: "--color-text",
    description: "Primary text.",
  },
  muted: {
    label: "Muted text",
    group: "App",
    cssVariable: "--color-muted",
    description: "Secondary text and hints.",
  },
  primary: {
    label: "Primary",
    group: "App",
    cssVariable: "--color-primary",
    description: "Accent for buttons, selection, and links.",
  },
  onPrimary: {
    label: "Text on primary",
    group: "App",
    cssVariable: "--color-on-primary",
    description: "Text drawn over the primary color.",
  },
  focus: {
    label: "Focus ring",
    group: "App",
    cssVariable: "--color-focus",
    description: "Keyboard focus accent.",
  },
  success: {
    label: "Success",
    group: "Status",
    cssVariable: "--color-success",
    description: "Connected and completed states.",
  },
  warning: {
    label: "Warning",
    group: "Status",
    cssVariable: "--color-warning",
    description: "Warning banners.",
  },
  onWarning: {
    label: "Text on warning",
    group: "Status",
    cssVariable: "--color-on-warning",
    description: "Text drawn over the warning color.",
  },
  error: {
    label: "Error",
    group: "Status",
    cssVariable: "--color-error",
    description: "Failures and removed lines.",
  },
  errorText: {
    label: "Error text",
    group: "Status",
    cssVariable: "--color-error-text",
    description: "Error messages.",
  },
  comment: {
    label: "Comment",
    group: "Syntax",
    cssVariable: "--syntax-comment",
    description: "Comments and quotes.",
  },
  keyword: {
    label: "Keyword",
    group: "Syntax",
    cssVariable: "--syntax-keyword",
    description: "Keywords and selectors.",
  },
  string: {
    label: "String",
    group: "Syntax",
    cssVariable: "--syntax-string",
    description: "Strings, regular expressions, and added lines.",
  },
  number: {
    label: "Number",
    group: "Syntax",
    cssVariable: "--syntax-number",
    description: "Numbers, literals, and symbols.",
  },
  function: {
    label: "Function",
    group: "Syntax",
    cssVariable: "--syntax-function",
    description: "Function and section names, built-ins.",
  },
  attribute: {
    label: "Attribute",
    group: "Syntax",
    cssVariable: "--syntax-attribute",
    description: "Attributes and properties.",
  },
  type: {
    label: "Type",
    group: "Syntax",
    cssVariable: "--syntax-type",
    description: "Types and classes.",
  },
  variable: {
    label: "Variable",
    group: "Syntax",
    cssVariable: "--syntax-variable",
    description: "Variables and parameters.",
  },
  tag: {
    label: "Tag",
    group: "Syntax",
    cssVariable: "--syntax-tag",
    description: "Markup tags and names.",
  },
  operator: {
    label: "Operator",
    group: "Syntax",
    cssVariable: "--syntax-operator",
    description: "Operators and punctuation.",
  },
  meta: {
    label: "Meta",
    group: "Syntax",
    cssVariable: "--syntax-meta",
    description: "Preprocessor and meta lines.",
  },
};

/** Identifier of the theme used when nothing else is selected. */
export const DEFAULT_THEME_ID = "comma";

/** Appearance used when none is saved. */
export const DEFAULT_APPEARANCE: AppearanceSettings = {
  themeId: DEFAULT_THEME_ID,
  mode: "dark",
  customThemes: [],
};

/** Prefix that distinguishes custom theme ids from built-in ones. */
export const CUSTOM_THEME_PREFIX = "custom-";
