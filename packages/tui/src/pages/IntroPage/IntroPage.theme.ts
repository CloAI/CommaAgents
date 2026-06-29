import { type BoxProps, defineTheme, type ThemeOf } from "../../Theme";

/**
 * Memoized themed style objects for the IntroPage component.
 */
export const useIntroPageTheme = defineTheme(() => ({
  /** Root container — vertically centers TitleIcon + ChatTextArea. */
  root: {
    flexDirection: "column",
    alignItems: "center",
  } satisfies BoxProps,
}));

/** Resolved style object shape returned by {@link useIntroPageTheme}. */
export type IntroPageTheme = ThemeOf<typeof useIntroPageTheme>;
