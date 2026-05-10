import { defineTheme, type BoxProps, type TextProps, type ThemeOf } from "../../theme";

/**
 * Memoized themed style objects for {@link ScrollableList}.
 *
 * The theme intentionally exposes only structural/empty-state styles —
 * row visual treatment is the caller's responsibility (delivered via the
 * `isSelected` flag passed to `renderItem`).
 */
export const useScrollableListTheme = defineTheme((tokens) => ({
  /**
   * Root viewport. `overflow: "hidden"` clips the absolutely-positioned
   * inner content to the measured height, while `flexGrow: 1` lets the
   * viewport claim whatever vertical space the parent layout offers.
   */
  viewport: {
    flexDirection: "column",
    width: "100%",
    flexGrow: 1,
    overflow: "hidden",
  } satisfies BoxProps,
  /** Empty-state container. */
  empty: {
    flexDirection: "column",
    width: "100%",
  } satisfies BoxProps,
  /** Empty-state text style. */
  emptyText: {
    color: tokens.colors.muted,
    dimColor: tokens.typography.secondaryDim,
  } satisfies TextProps,
}));

/** Resolved style shape returned by {@link useScrollableListTheme}. */
export type ScrollableListTheme = ThemeOf<typeof useScrollableListTheme>;
