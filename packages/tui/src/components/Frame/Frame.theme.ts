import { useMemo } from "react";

import { useTheme } from "../../theme";

/** Spread-ready style objects for the Frame component. */
export interface FrameTheme {
  /** Root container (column layout). Height is set dynamically by the container. */
  readonly root: {
    readonly flexDirection: "column";
  };
  /** Tab bar container. */
  readonly tabBar: {
    readonly flexDirection: "row";
    readonly gap: number;
    readonly paddingX: number;
    readonly marginBottom: number;
  };
  /** Style for an active tab label. */
  readonly activeTab: {
    readonly bold: boolean;
    readonly color: string;
    readonly underline: boolean;
  };
  /** Style for an inactive tab label. */
  readonly inactiveTab: {
    readonly dimColor: boolean;
  };
  /** Style for the tab shortcut hint (e.g. "F1"). */
  readonly tabHint: {
    readonly dimColor: boolean;
  };
  /** Separator below the tab bar. */
  readonly separator: {
    readonly paddingX: number;
    readonly text: {
      readonly dimColor: boolean;
    };
    /** Single separator character to repeat across the terminal width. */
    readonly char: string;
  };
  /** Content area below the tab bar (grows to fill available space). */
  readonly content: {
    readonly flexDirection: "column";
    readonly flexGrow: number;
  };
  /** Footer area pinned to the bottom of the frame. */
  readonly footer: {
    readonly flexDirection: "column";
  };
}

/**
 * Returns themed style objects for the Frame component.
 * Consumes global tokens via `useTheme()`.
 */
export function useFrameTheme(): FrameTheme {
  const tokens = useTheme();

  return useMemo<FrameTheme>(
    () => ({
      root: {
        flexDirection: "column",
      },
      tabBar: {
        flexDirection: "row",
        gap: tokens.spacing.md,
        paddingX: tokens.spacing.sm,
        marginBottom: tokens.spacing.none,
      },
      activeTab: {
        bold: tokens.typography.headerBold,
        color: tokens.colors.primary,
        underline: true,
      },
      inactiveTab: {
        dimColor: tokens.typography.secondaryDim,
      },
      tabHint: {
        dimColor: tokens.typography.secondaryDim,
      },
      separator: {
        paddingX: tokens.spacing.sm,
        text: {
          dimColor: tokens.typography.secondaryDim,
        },
        char: tokens.separator.char,
      },
      content: {
        flexDirection: "column",
        flexGrow: 1,
      },
      footer: {
        flexDirection: "column",
      },
    }),
    [tokens],
  );
}
