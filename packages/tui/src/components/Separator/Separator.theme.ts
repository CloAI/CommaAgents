import {
  type BoxProps,
  defineTheme,
  type TextProps,
  type ThemeOf,
} from "../../theme";

/** Memoized themed style objects for the `Separator` component. */
export const useSeparatorTheme = defineTheme((tokens) => ({
  /** Outer container holding the separator line. */
  container: {
    flexDirection: "row",
    // The separator is exactly one row tall. Inside a column-flex parent,
    // adding flexGrow on the main axis would stretch the separator
    // vertically, producing layout oscillations with sibling growable
    // boxes. Instead, rely on Yoga's default cross-axis stretch (or an
    // explicit alignSelf: "stretch") so the separator spans the parent's
    // full width without consuming height.
    flexGrow: 0,
    flexShrink: 0,
    alignSelf: "stretch",
    paddingX: tokens.spacing.sm,
  } satisfies BoxProps,
  /** Text props for the separator character itself. */
  text: {
    dimColor: tokens.typography.secondaryDim,
  } satisfies TextProps,
  /** Single character repeated to draw the line. */
  char: tokens.separator.char,
  /** Default fixed-length width when no explicit width is provided and full mode is off. */
  defaultFixedWidth: tokens.separator.width,
}));

/** Resolved style object shape returned by {@link useSeparatorTheme}. */
export type SeparatorTheme = ThemeOf<typeof useSeparatorTheme>;
