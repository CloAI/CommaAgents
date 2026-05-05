import type { BoxProps } from "ink";
import { useMemo } from "react";

import { useTheme } from "../../theme";

/** Spread-ready style objects for the Modal component. */
export interface ModalTheme {
  /** The modal content container. */
  readonly content: {
    readonly flexDirection: "column";
    readonly borderStyle: BoxProps["borderStyle"];
    readonly borderColor: string;
    readonly paddingX: number;
    readonly paddingY: number;
    readonly overflow: "hidden";
    readonly flexShrink: 0;
    readonly backgroundColor: string;
  };
  /** Modal title text style. */
  readonly title: {
    readonly bold: boolean;
    readonly color: string;
  };
}

/**
 * Returns themed style objects for the Modal component.
 * Consumes global tokens via `useTheme()`.
 */
export function useModalTheme(): ModalTheme {
  const tokens = useTheme();

  return useMemo<ModalTheme>(
    () => ({
      content: {
        flexDirection: "column",
        borderStyle: tokens.borders.style as BoxProps["borderStyle"],
        borderColor: tokens.borders.color,
        paddingX: tokens.spacing.md,
        paddingY: tokens.spacing.sm,
        overflow: "hidden",
        flexShrink: 0,
        backgroundColor: tokens.colors.background,
      },
      title: {
        bold: tokens.typography.headerBold,
        color: tokens.colors.primary,
      },
    }),
    [tokens],
  );
}
