/** Color palette used throughout the TUI. */
export interface ThemeColors {
  /** Primary accent (headers, active elements). */
  readonly primary: string;
  /** Secondary accent (descriptions, hints). */
  readonly secondary: string;
  /** Success state. */
  readonly success: string;
  /** Warning state. */
  readonly warning: string;
  /** Error state. */
  readonly error: string;
  /** Muted/dim text. */
  readonly muted: string;
  /** User message color. */
  readonly userMessage: string;
  /** Agent message color. */
  readonly agentMessage: string;
  /** System message color. */
  readonly systemMessage: string;
  /** Input prompt color. */
  readonly prompt: string;
  /** Waiting-for-input state. */
  readonly waitingInput: string;
}

/** Spacing values (applied to padding/margin). */
export interface ThemeSpacing {
  /** No spacing. */
  readonly none: number;
  /** Tight spacing (1). */
  readonly xs: number;
  /** Standard horizontal padding (1). */
  readonly sm: number;
  /** Medium spacing (2). */
  readonly md: number;
  /** Large spacing (3). */
  readonly lg: number;
}

/** Typography tokens for text styling. */
export interface ThemeTypography {
  /** Whether headers are bold. */
  readonly headerBold: boolean;
  /** Whether labels are bold. */
  readonly labelBold: boolean;
  /** Whether dim styling is used for secondary text. */
  readonly secondaryDim: boolean;
}

/** Border styling tokens. */
export interface ThemeBorders {
  /** Default border style for boxes. */
  readonly style: string;
  /** Default border color. */
  readonly color: string;
}

/** Separator configuration. */
export interface ThemeSeparator {
  /** Character used for horizontal separators. */
  readonly char: string;
  /** Width of the separator (number of characters). */
  readonly width: number;
}

/** Complete theme token set. */
export interface Theme {
  readonly colors: ThemeColors;
  readonly spacing: ThemeSpacing;
  readonly typography: ThemeTypography;
  readonly borders: ThemeBorders;
  readonly separator: ThemeSeparator;
}
