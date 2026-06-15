import { defineTheme } from "../../Theme/DefineTheme";

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
  },
  searchWrapper: {
    flexShrink: 0,
    marginBottom: tokens.spacing.sm,
  },
  item: {
    flexDirection: "row",
    paddingX: tokens.spacing.sm,
    paddingY: 0,
  },
  itemSelected: {
    flexDirection: "row",
    paddingX: tokens.spacing.sm,
    paddingY: 0,
    backgroundColor: tokens.colors.surface,
  },
  label: {
    bold: false,
    color: tokens.colors.primary,
  },
  labelSelected: {
    bold: true,
    color: tokens.colors.primary,
  },
  separator: {
    color: tokens.colors.muted,
  },
  description: {
    color: tokens.colors.muted,
  },
  empty: {
    color: tokens.colors.muted,
    dimColor: true,
  },
}));

/**
 * Extract the resolved theme shape from `useCommandPaletteTheme`.
 * Use this to type the `theme` prop in the component.
 */
export type CommandPaletteTheme = ReturnType<typeof useCommandPaletteTheme>;
