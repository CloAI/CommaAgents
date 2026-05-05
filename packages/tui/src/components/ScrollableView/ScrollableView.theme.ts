import { defineTheme, type ThemeOf } from "../../theme";

/** Memoized themed style objects for {@link ScrollableView}. */
export const useScrollableViewTheme = defineTheme((tokens) => ({
  /**
   * Outer row container — holds the viewport column and the scrollbar
   * column side-by-side.
   */
  outer: {
    flexDirection: "row" as const,
    width: "100%" as const,
    flexGrow: 1,
    overflow: "hidden" as const,
  },
  /**
   * Viewport column. `overflow: "hidden"` clips the absolutely-positioned
   * inner content; `flexGrow: 1` claims the available width.
   */
  viewport: {
    flexDirection: "column" as const,
    flexGrow: 1,
    overflow: "hidden" as const,
  },
  /** Empty-state container. */
  empty: {
    flexDirection: "column" as const,
    width: "100%" as const,
  },
  /** Empty-state text. */
  emptyText: {
    color: tokens.colors.muted,
    dimColor: tokens.typography.secondaryDim,
  },
}));

export type ScrollableViewTheme = ThemeOf<typeof useScrollableViewTheme>;
