import { type BoxProps, defineTheme, type ThemeOf } from "../../Theme";

/**
 * Memoized themed style objects for the `Button` component.
 *
 * Each variant gets its own resolved color set so the render function only
 * needs to index by `ButtonVariant` — no conditional logic inside JSX.
 */
export const useButtonTheme = defineTheme((tokens) => ({
  buttonContainer: {
    flexDirection: "row",
    paddingX: tokens.spacing.md,
  } satisfies BoxProps,
  /**
   * Per-variant color pairs used to style the border and label text.
   * Both `color` and `focusColor` are terminal color strings passed
   * directly to Ink `<Text>` / `<Box>` props.
   */
  variants: {
    primary: {
      /** Normal (unfocused, unhovered) border and label color. */
      color: tokens.colors.primary,
      /** Color when focused or hovered. */
      focusColor: tokens.colors.primary,
    },
    secondary: {
      color: tokens.colors.secondary,
      focusColor: tokens.colors.secondary,
    },
    danger: {
      color: tokens.colors.error,
      focusColor: tokens.colors.error,
    },
    ghost: {
      color: tokens.colors.muted,
      focusColor: tokens.colors.primary,
    },
  },

  /** Label is bold when the button has focus. */
  labelBold: tokens.typography.labelBold,

  /** Color applied to the entire button when disabled. */
  disabledColor: tokens.colors.muted,
}));

/** Resolved style object shape returned by {@link useButtonTheme}. */
export type ButtonTheme = ThemeOf<typeof useButtonTheme>;
