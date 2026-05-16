import type { Theme } from "../theme.types";

/**
 * Light — bright background with dark text, suitable for light terminals.
 *
 * Background layers descend from bright canvas to progressively darker
 * elevation steps, mimicking shadow depth in a light environment:
 * `background` (canvas) ← `backgroundLayerOne` ← `backgroundLayerTwo` ←
 * `backgroundLayerThree` ← `surface` (interactive).
 */
export const lightTheme: Theme = {
  colors: {
    primary: "#005f87",
    secondary: "#5f5f5f",
    success: "#008700",
    warning: "#af8700",
    error: "#d70000",
    muted: "#878787",
    background: "#ffffff",
    backgroundLayerOne: "#F7F7F7",
    backgroundLayerTwo: "#EEEEEE",
    backgroundLayerThree: "#E4E4E4",
    surface: "#D9D9D9",
    cursor: "#000000",
    scrollThumb: "#5f5f5f",
    scrollTrack: "#bcbcbc",
    userMessage: "#005f00",
    agentMessage: "#005f87",
    systemMessage: "#875f00",
    prompt: "#005f87",
    waitingInput: "#870087",
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
    color: "#5f5f5f",
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
