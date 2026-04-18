import { useMemo } from "react";

import { useTheme } from "../../theme";

/** Spread-ready style objects for the StrategyPicker component. */
export interface StrategyPickerTheme {
  /** Outer container. */
  readonly container: {
    readonly flexDirection: "column";
    readonly paddingX: number;
  };
  /** "Choose a strategy" heading text. */
  readonly heading: {
    readonly bold: boolean;
    readonly color: string;
  };
  /** Wrapper around the select input. */
  readonly selectWrapper: {
    readonly marginTop: number;
  };
}

/**
 * Returns themed style objects for the StrategyPicker component.
 * Consumes global tokens via `useTheme()`.
 */
export function useStrategyPickerTheme(): StrategyPickerTheme {
  const tokens = useTheme();

  return useMemo<StrategyPickerTheme>(
    () => ({
      container: {
        flexDirection: "column",
        paddingX: tokens.spacing.sm,
      },
      heading: {
        bold: tokens.typography.headerBold,
        color: tokens.colors.primary,
      },
      selectWrapper: {
        marginTop: tokens.spacing.xs,
      },
    }),
    [tokens],
  );
}
