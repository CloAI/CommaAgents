import { useMemo } from "react";

import { useTheme } from "../../theme";

/** Spread-ready style objects for the Frame component. */
export interface FrameTheme {
  /** Root container (column layout). Height is set dynamically by the container. */
  readonly root: {
    readonly flexDirection: "column";
    readonly backgroundColor: string;
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
  /**
   * Style applied (merged on top of the active/inactive style) when the
   * pointer is hovering over a tab. Only sets the visual highlight —
   * underline / bold come from the base style.
   */
  readonly hoveredTab: {
    readonly color: string;
    readonly bold: boolean;
  };
  /** Style for the tab shortcut hint (e.g. "Alt+1"). */
  readonly tabHint: {
    readonly dimColor: boolean;
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
        backgroundColor: tokens.colors.background,
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
      hoveredTab: {
        color: tokens.colors.primary,
        bold: true,
      },
      tabHint: {
        dimColor: tokens.typography.secondaryDim,
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
