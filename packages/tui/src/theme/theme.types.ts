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
  /** App background color (the global canvas). */
  readonly background: string;

  /** Depth backgrounds for layering multiple widgets */
  readonly backgroundLayerOne: string;
  readonly backgroundLayerTwo: string;
  readonly backgroundLayerThree: string;
  /**
   * Elevated surface background (input fields, modals, panels) — sits one
   * step above {@link ThemeColors.background} so interactive areas read as
   * distinct from the frame canvas.
   */
  readonly surface: string;
  /** Cursor highlight color. */
  readonly cursor: string;
  /** Scrollbar thumb (active region). */
  readonly scrollThumb: string;
  /** Scrollbar track (inactive region). */
  readonly scrollTrack: string;
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

/** Named breakpoint for terminal width thresholds (mobile-first, min-width). */
export type BreakpointName = "xs" | "sm" | "md" | "lg" | "xl";

/** Terminal width breakpoints in columns (mobile-first, min-width). */
export type ThemeBreakpoints = Readonly<Record<BreakpointName, number>>;

/**
 * Responsive container width per breakpoint.
 *
 * `undefined` means full terminal width (no max constraint).
 * A number means a fixed column width.
 */
export type ThemeContainerWidths = Readonly<
  Record<BreakpointName, number | undefined>
>;

/** Complete theme token set. */
export interface Theme {
  readonly colors: ThemeColors;
  readonly spacing: ThemeSpacing;
  readonly typography: ThemeTypography;
  readonly borders: ThemeBorders;
  readonly separator: ThemeSeparator;
  readonly breakpoints: ThemeBreakpoints;
  readonly containerWidths: ThemeContainerWidths;
}
