import type { Theme } from "./theme.types";

/**
 * Default theme.
 *
 * All colors are absolute hex literals (truecolor SGR) so rendering is
 * identical across terminals regardless of the user's palette / theme
 * preferences. Named ANSI colors (`"cyan"`, `"red"`, etc.) are re-mapped
 * by every terminal to its current color scheme — never use them in
 * tokens. If a token-derived value bleeds into a component prop, the
 * hex value flows through unchanged.
 */
export const defaultTheme: Theme = {
  colors: {
    primary: "#00d7d7", // cyan
    secondary: "#808080", // gray
    success: "#5fd75f", // green
    warning: "#d7d75f", // yellow
    error: "#ff5f5f", // red
    muted: "#8a8a8a",
    background: "#000000", // black
    surface: "#303030", // elevated surface (input fields, panels)
    cursor: "#ffffff",
    scrollThumb: "#bcbcbc",
    scrollTrack: "#585858",
    userMessage: "#5fd75f", // green
    agentMessage: "#00d7d7", // cyan
    systemMessage: "#d7d75f", // yellow
    prompt: "#00d7d7", // cyan
    waitingInput: "#d75fd7", // magenta
  },
  spacing: {
    none: 0,
    xs: 1,
    sm: 1,
    md: 2,
    lg: 3,
  },
  typography: {
    headerBold: true,
    labelBold: true,
    secondaryDim: true,
  },
  borders: {
    style: "single",
    color: "#808080",
  },
  separator: {
    char: "\u2500",
    width: 60,
  },
  breakpoints: {
    xs: 40,
    sm: 60,
    md: 80,
    lg: 120,
    xl: 160,
  },
  containerWidths: {
    xs: undefined,
    sm: undefined,
    md: 80,
    lg: 80,
    xl: 80,
  },
} as const;
