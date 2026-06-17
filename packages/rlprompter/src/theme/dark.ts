import type { Theme } from "./theme.types";

/** Default dark theme — truecolor hex literals for consistent rendering. */
export const darkTheme: Theme = {
  colors: {
    primary: "#D0BCFF",
    secondary: "#CCC2DC",
    success: "#66BB6A",
    warning: "#FFA726",
    error: "#EF5350",
    muted: "#938F99",
    background: "#121212",
    surface: "#1E1E1E",
    diffAdded: "#66BB6A",
    diffRemoved: "#EF5350",
  },
  spacing: { none: 0, xs: 1, sm: 1, md: 2, lg: 3 },
  typography: { headerBold: true, labelBold: true, secondaryDim: true },
  borders: { style: "round", color: "#49454F" },
} as const;
