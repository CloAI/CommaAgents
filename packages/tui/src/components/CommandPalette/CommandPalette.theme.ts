import { useMemo } from "react";
import { useTheme } from "../../theme";

/** Spread-ready style objects for the CommandPalette component. */
export interface CommandPaletteTheme {
  /** Full flex column for the palette content area. */
  readonly container: {
    readonly flexDirection: "column";
    readonly width: string;
    readonly height: string;
  };
  /** Spacing wrapper around the search input. */
  readonly searchWrapper: {
    readonly flexShrink: 0;
    readonly marginBottom: number;
  };
  /** Flex row for a single command item. */
  readonly item: {
    readonly flexDirection: "row";
    readonly paddingX: number;
    readonly paddingY: number;
  };
  /** Selected item highlight override. */
  readonly itemSelected: {
    readonly flexDirection: "row";
    readonly paddingX: number;
    readonly paddingY: number;
    readonly backgroundColor: string;
  };
  /** Command label text. */
  readonly label: {
    readonly bold: boolean;
    readonly color: string;
  };
  /** Selected command label text. */
  readonly labelSelected: {
    readonly bold: boolean;
    readonly color: string;
  };
  /** Description separator between label and description. */
  readonly separator: {
    readonly color: string;
  };
  /** Command description text. */
  readonly description: {
    readonly color: string;
  };
  /** "No results" placeholder text. */
  readonly empty: {
    readonly color: string;
    readonly dimColor: boolean;
  };
}

/**
 * Returns themed style objects for the CommandPalette component.
 * Consumes global tokens via `useTheme()`.
 */
export function useCommandPaletteTheme(): CommandPaletteTheme {
  const tokens = useTheme();

  return useMemo<CommandPaletteTheme>(
    () => ({
      container: {
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
    }),
    [tokens],
  );
}
