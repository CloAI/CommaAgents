import type { Theme } from "../theme.types";

/**
 * Solarized Dark — low-contrast balanced palette popular for terminals.
 *
 * Background layers ascend from deepest to lightest, creating a consistent
 * elevation gradient: `background` (canvas) ← `backgroundLayerOne` ←
 * `backgroundLayerTwo` ← `backgroundLayerThree` ← `surface` (interactive).
 */
export const solarizedDarkTheme: Theme = {
  colors: {
    primary: "#268bd2",
    secondary: "#93a1a1",
    success: "#859900",
    warning: "#b58900",
    error: "#dc322f",
    muted: "#586e75",
    background: "#002b36",
    backgroundLayerOne: "#063542",
    backgroundLayerTwo: "#0a3f4d",
    backgroundLayerThree: "#0e4a5a",
    surface: "#073642",
    cursor: "#fdf6e3",
    scrollThumb: "#93a1a1",
    scrollTrack: "#586e75",
    userMessage: "#859900",
    agentMessage: "#268bd2",
    systemMessage: "#b58900",
    prompt: "#2aa198",
    waitingInput: "#d33682",
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
    color: "#586e75",
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
