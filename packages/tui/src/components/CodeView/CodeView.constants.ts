/** Default shiki theme optimized for terminal rendering. */
export const DEFAULT_SHIKI_THEME = "vitesse-dark" as const;

/**
 * Commonly used languages to pre-load in the highlighter.
 * Additional languages are loaded on-demand by shiki.
 */
export const PRELOADED_LANGUAGES = [
  "typescript",
  "javascript",
  "python",
  "json",
  "bash",
  "html",
  "css",
  "markdown",
] as const;

/** Minimum gutter width (characters) for line numbers. */
export const MIN_LINE_NUMBER_WIDTH = 3;
