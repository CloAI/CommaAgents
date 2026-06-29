import { type BoxProps, defineTheme, type ThemeOf } from "../Theme";

/**
 * Memoized themed style objects for the App component.
 *
 * @example
 * ```tsx
 * const theme = useAppTheme();
 * return <Box {...theme.root}>...</Box>;
 * ```
 */
export const useAppTheme = defineTheme(() => ({
  /** Root container (column layout, full height). */
  root: {
    flexDirection: "column",
    height: "100%",
  } satisfies BoxProps,
}));

/** Resolved style object shape returned by {@link useAppTheme}. */
export type AppTheme = ThemeOf<typeof useAppTheme>;
