import type { Theme } from "./theme.types";

/** Default dark-on-light terminal theme. */
export const defaultTheme: Theme = {
  colors: {
    primary: "cyan",
    secondary: "gray",
    success: "green",
    warning: "yellow",
    error: "red",
    muted: "gray",
    userMessage: "green",
    agentMessage: "cyan",
    systemMessage: "yellow",
    prompt: "cyan",
    waitingInput: "magenta",
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
    color: "gray",
  },
  separator: {
    char: "\u2500",
    width: 60,
  },
} as const;
