import {
  type BoxProps,
  defineTheme,
  type TextProps,
  type ThemeOf,
} from "../../Theme";

/**
 * Returns themed style objects for the CommandPalette component.
 * Consumes global tokens via `defineTheme`.
 */
export const useCommandPaletteTheme = defineTheme((tokens) => ({
  container: {
    flexGrow: 1,
    flexDirection: "column",
    width: "100%",
    height: "100%",
  } satisfies BoxProps,
  searchWrapper: {
    flexShrink: 0,
    marginBottom: tokens.spacing.sm,
  } satisfies BoxProps,
  item: {
    flexDirection: "row",
    paddingX: tokens.spacing.sm,
    paddingY: 0,
  } satisfies BoxProps,
  itemSelected: {
    flexDirection: "row",
    paddingX: tokens.spacing.sm,
    paddingY: 0,
    backgroundColor: tokens.colors.surface,
  } satisfies BoxProps,
  label: {
    bold: false,
    color: tokens.colors.primary,
  } satisfies TextProps,
  labelSelected: {
    bold: true,
    color: tokens.colors.primary,
  } satisfies TextProps,
  separator: {
    color: tokens.colors.muted,
  } satisfies TextProps,
  description: {
    color: tokens.colors.muted,
  } satisfies TextProps,
  empty: {
    color: tokens.colors.muted,
    dimColor: true,
  } satisfies TextProps,
}));

/**
 * Extract the resolved theme shape from `useCommandPaletteTheme`.
 * Use this to type the `theme` prop in the component.
 */
export type CommandPaletteTheme = ThemeOf<typeof useCommandPaletteTheme>;
