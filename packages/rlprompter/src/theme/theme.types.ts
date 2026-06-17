// Theme tokens for the rlprompter TUI. Self-contained (does not depend on the
// @comma-agents/tui theme) but mirrors its token-based, Ink-native approach.

/** Color palette used throughout the TUI. */
export interface ThemeColors {
  readonly primary: string;
  readonly secondary: string;
  readonly success: string;
  readonly warning: string;
  readonly error: string;
  readonly muted: string;
  readonly background: string;
  readonly surface: string;
  /** Diff added-line color. */
  readonly diffAdded: string;
  /** Diff removed-line color. */
  readonly diffRemoved: string;
}

/** Spacing values applied to padding/margin. */
export interface ThemeSpacing {
  readonly none: number;
  readonly xs: number;
  readonly sm: number;
  readonly md: number;
  readonly lg: number;
}

/** Typography tokens. */
export interface ThemeTypography {
  readonly headerBold: boolean;
  readonly labelBold: boolean;
  readonly secondaryDim: boolean;
}

/** Border styling tokens. */
export interface ThemeBorders {
  readonly style: string;
  readonly color: string;
}

/** Complete theme token set. */
export interface Theme {
  readonly colors: ThemeColors;
  readonly spacing: ThemeSpacing;
  readonly typography: ThemeTypography;
  readonly borders: ThemeBorders;
}
