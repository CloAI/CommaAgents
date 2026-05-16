import type { Theme } from "../theme.types";

/**
 * Material Dark — Material Design 3 dark palette with a clear elevation-based
 * depth system and minimal spacing.
 *
 * Depth layers ascend from the deepest background through progressively
 * lighter surfaces, creating a visual hierarchy: `background` (canvas) ←
 * `surface` (cards) ← `backgroundLayerOne` (panels) ←
 * `backgroundLayerTwo` (inputs, modals) ← `backgroundLayerThree` (dialogs).
 *
 * All colors are absolute hex literals (truecolor SGR) for consistent
 * rendering across terminals.
 */
export const darkTheme: Theme = {
  colors: {
    primary: "#D0BCFF",
    secondary: "#CCC2DC",
    success: "#66BB6A",
    warning: "#FFA726",
    error: "#EF5350",
    muted: "#938F99",
    background: "#121212",
    backgroundLayerOne: "#242424",
    backgroundLayerTwo: "#2C2C2C",
    backgroundLayerThree: "#333333",
    surface: "#1E1E1E",
    cursor: "#FFFFFF",
    scrollThumb: "#6E6E6E",
    scrollTrack: "#2C2C2C",
    userMessage: "#66BB6A",
    agentMessage: "#D0BCFF",
    systemMessage: "#FFA726",
    prompt: "#D0BCFF",
    waitingInput: "#90CAF9",
  },
  spacing: {
    none: 0,
    xs: 1,
    sm: 1,
    md: 1,
    lg: 2,
  },
  typography: {
    headerBold: true,
    labelBold: true,
    secondaryDim: true,
  },
  borders: {
    style: "single",
    color: "#49454F",
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
