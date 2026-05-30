import { useMemo } from "react";

import { useTheme } from "../../Theme";

/** Spread-ready style objects for the IntroPage component. */
export interface IntroPageTheme {
  /** Root container — vertically centers TitleIcon + ChatTextArea. */
  readonly root: {
    readonly flexDirection: "column";
    readonly alignItems: "center";
  };
}

/**
 * Returns themed style objects for the IntroPage component.
 * Consumes global tokens via `useTheme()`.
 */
export function useIntroPageTheme(): IntroPageTheme {
  // Currently no token-driven values, but we plumb the hook so future
  // theme changes flow through the same channel as every other page.
  useTheme();

  return useMemo<IntroPageTheme>(
    () => ({
      root: {
        flexDirection: "column",
        alignItems: "center",
      },
    }),
    [],
  );
}
