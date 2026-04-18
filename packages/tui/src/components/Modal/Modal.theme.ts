import type { BoxProps } from "ink";
import { useMemo } from "react";

import { useTheme } from "../../theme";

/** Spread-ready style objects for the Modal component. */
export interface ModalTheme {
  /** Full-screen overlay backdrop (absolute, covers entire terminal). */
  readonly backdrop: {
    readonly position: "absolute";
    readonly display: "flex";
    readonly flexDirection: "column";
    readonly alignItems: "center";
    readonly justifyContent: "center";
  };
  /** Dimmed background text color for the overlay. */
  readonly backdropColor: string;
  /** The modal content container. */
  readonly content: {
    readonly flexDirection: "column";
    readonly borderStyle: BoxProps["borderStyle"];
    readonly borderColor: string;
    readonly paddingX: number;
    readonly paddingY: number;
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
      backdrop: {
        position: "absolute",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
      },
      backdropColor: tokens.colors.muted,
      content: {
        flexDirection: "column",
        borderStyle: tokens.borders.style as BoxProps["borderStyle"],
        borderColor: tokens.borders.color,
        paddingX: tokens.spacing.md,
        paddingY: tokens.spacing.sm,
      },
      title: {
        bold: tokens.typography.headerBold,
        color: tokens.colors.primary,
      },
    }),
    [tokens],
  );
}
