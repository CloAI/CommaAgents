import type { Theme } from "../theme.types";

/**
 * Dracula — dark palette with purple/cyan/pink accents.
 *
 * Background layers ascend from deepest to lightest, creating a consistent
 * elevation gradient: `background` (canvas) ← `backgroundLayerOne` ←
 * `backgroundLayerTwo` ← `backgroundLayerThree` ← `surface` (interactive).
 */
export const draculaTheme: Theme = {
  colors: {
    primary: "#bd93f9",
    secondary: "#6272a4",
    success: "#50fa7b",
    warning: "#f1fa8c",
    error: "#ff5555",
    muted: "#6272a4",
    background: "#282a36",
    backgroundLayerOne: "#2e303c",
    backgroundLayerTwo: "#343740",
    backgroundLayerThree: "#3a3d48",
    surface: "#44475a",
    cursor: "#f8f8f2",
    scrollThumb: "#bd93f9",
    scrollTrack: "#44475a",
    userMessage: "#50fa7b",
    agentMessage: "#8be9fd",
    systemMessage: "#f1fa8c",
    prompt: "#ff79c6",
    waitingInput: "#ff79c6",
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
    color: "#6272a4",
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
