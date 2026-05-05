import type { BoxProps } from "ink";
import { useMemo } from "react";

import { useTheme } from "../../theme";

/** Spread-ready style objects for the SearchInput component. */
export interface SearchInputTheme {
  /** Rounded-border wrapper around the single-line input. */
  readonly inputBorder: {
    readonly borderStyle: BoxProps["borderStyle"];
    readonly borderColor: string;
    readonly paddingX: number;
    readonly width: string;
  };
  /** Text style for the prompt caret. */
  readonly prompt: {
    readonly color: string;
    readonly bold: boolean;
  };
  /** Text style for the user-entered query. */
  readonly query: {
    readonly color: string;
  };
  /** Text style for the placeholder shown when the query is empty. */
  readonly placeholder: {
    readonly color: string;
    readonly dimColor: boolean;
  };
}

/**
 * Returns themed style objects for the SearchInput component.
 * Consumes global tokens via `useTheme()`.
 */
export function useSearchInputTheme(): SearchInputTheme {
  const tokens = useTheme();

  return useMemo<SearchInputTheme>(
    () => ({
      inputBorder: {
        borderStyle: "round",
        borderColor: tokens.colors.primary,
        paddingX: tokens.spacing.xs,
        width: "100%",
      },
      prompt: {
        color: tokens.colors.primary,
        bold: tokens.typography.labelBold,
      },
      query: {
        color: tokens.colors.primary,
      },
      placeholder: {
        color: tokens.colors.muted,
        dimColor: tokens.typography.secondaryDim,
      },
    }),
    [tokens],
  );
}
