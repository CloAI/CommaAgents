import { defineTheme, type ThemeOf } from "../../theme";

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
    flexDirection: "column" as const,
    width: "100%" as const,
    flexGrow: 1,
    overflow: "hidden" as const,
  },
  /** Empty-state container. */
  empty: {
    flexDirection: "column" as const,
    width: "100%" as const,
  },
  /** Empty-state text style. */
  emptyText: {
    color: tokens.colors.muted,
    dimColor: tokens.typography.secondaryDim,
  },
}));

/** Resolved style shape returned by {@link useScrollableListTheme}. */
export type ScrollableListTheme = ThemeOf<typeof useScrollableListTheme>;
