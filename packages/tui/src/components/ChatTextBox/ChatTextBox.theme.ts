import { useMemo } from "react";

import { useTheme } from "../../theme";

/** Spread-ready style objects for the ChatTextBox component. */
export interface ChatTextBoxTheme {
  /** Outer column container wrapping the border and content. */
  readonly container: {
    readonly flexDirection: "column";
    readonly width: "100%";
  };
  /** Border line text (top / bottom rules). */
  readonly border: {
    readonly color: string;
    readonly dimColor: boolean;
  };
  /** The row inside the border (│ content │). */
  readonly innerRow: {
    readonly flexDirection: "row";
  };
  /** Border side characters (│). */
  readonly borderSide: {
    readonly color: string;
    readonly dimColor: boolean;
  };
  /** Strategy label before the separator. */
  readonly strategyLabel: {
    readonly color: string;
    readonly bold: boolean;
  };
  /** The " > " separator between strategy and input. */
  readonly separator: {
    readonly dimColor: boolean;
  };
  /** Unicode box-drawing characters used for the border. */
  readonly chars: {
    readonly topLeft: string;
    readonly topRight: string;
    readonly bottomLeft: string;
    readonly bottomRight: string;
    readonly horizontal: string;
    readonly vertical: string;
  };
}

/**
 * Returns themed style objects for the ChatTextBox component.
 * Consumes global tokens via `useTheme()`.
 */
export function useChatTextBoxTheme(): ChatTextBoxTheme {
  const tokens = useTheme();

  return useMemo<ChatTextBoxTheme>(
    () => ({
      container: {
        flexDirection: "column",
        width: "100%",
      },
      border: {
        color: tokens.borders.color,
        dimColor: tokens.typography.secondaryDim,
      },
      innerRow: {
        flexDirection: "row",
      },
      borderSide: {
        color: tokens.borders.color,
        dimColor: tokens.typography.secondaryDim,
      },
      strategyLabel: {
        color: tokens.colors.primary,
        bold: tokens.typography.labelBold,
      },
      separator: {
        dimColor: tokens.typography.secondaryDim,
      },
      chars: {
        topLeft: "\u256D",
        topRight: "\u256E",
        bottomLeft: "\u2570",
        bottomRight: "\u256F",
        horizontal: "\u2500",
        vertical: "\u2502",
      },
    }),
    [tokens],
  );
}
