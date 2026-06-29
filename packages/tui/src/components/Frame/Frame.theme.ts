import {
  type BoxProps,
  defineTheme,
  type TextProps,
  type ThemeOf,
} from "../../Theme";

/**
 * Memoized themed style objects for the Frame component.
 */
export const useFrameTheme = defineTheme((tokens) => ({
  /** Root container (column layout). Height is set dynamically by the container. */
  root: {
    flexDirection: "column",
    backgroundColor: tokens.colors.background,
  } satisfies BoxProps,
  /** Tab bar container. */
  tabBar: {
    flexDirection: "row",
    gap: tokens.spacing.md,
    paddingX: tokens.spacing.sm,
    marginBottom: tokens.spacing.none,
  } satisfies BoxProps,
  /** Style for an active tab label. */
  activeTab: {
    bold: tokens.typography.headerBold,
    color: tokens.colors.primary,
    underline: true,
  } satisfies TextProps,
  /** Style for an inactive tab label. */
  inactiveTab: {
    dimColor: tokens.typography.secondaryDim,
  } satisfies TextProps,
  /** Style applied when the pointer is hovering over a tab. */
  hoveredTab: {
    color: tokens.colors.primary,
    bold: true,
  } satisfies TextProps,
  /** Style for the tab shortcut hint (e.g. "Alt+1"). */
  tabHint: {
    dimColor: tokens.typography.secondaryDim,
  } satisfies TextProps,
  /** Content area below the tab bar (grows to fill available space). */
  content: {
    flexDirection: "column",
    flexGrow: 1,
  } satisfies BoxProps,
  /** Footer area pinned to the bottom of the frame. */
  footer: {
    flexDirection: "column",
  } satisfies BoxProps,
}));

/** Resolved style object shape returned by {@link useFrameTheme}. */
export type FrameTheme = ThemeOf<typeof useFrameTheme>;
