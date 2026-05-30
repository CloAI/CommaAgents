import {
  type BoxProps,
  defineTheme,
  type TextProps,
  type ThemeOf,
} from "../../Theme";

/** Memoized themed style objects for {@link ScrollableView}. */
export const useScrollableViewTheme = defineTheme((tokens) => ({
  /**
   * Outer row container — holds the viewport column and the scrollbar
   * column side-by-side.
   */
  outer: {
    flexDirection: "row",
    width: "100%",
    flexGrow: 1,
    overflow: "hidden",
  } satisfies BoxProps,
  /**
   * Viewport column. `overflow: "hidden"` clips the absolutely-positioned
   * inner content; `flexGrow: 1` claims the available width.
   */
  viewport: {
    flexDirection: "column",
    flexGrow: 1,
    overflow: "hidden",
  } satisfies BoxProps,
  /** Empty-state container. */
  empty: {
    flexDirection: "column",
    width: "100%",
  } satisfies BoxProps,
  /** Empty-state text. */
  emptyText: {
    color: tokens.colors.muted,
    dimColor: tokens.typography.secondaryDim,
  } satisfies TextProps,
}));

export type ScrollableViewTheme = ThemeOf<typeof useScrollableViewTheme>;
