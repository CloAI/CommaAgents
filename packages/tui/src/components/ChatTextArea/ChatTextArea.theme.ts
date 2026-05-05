import { useMemo } from "react";

import { useTheme } from "../../theme";

/** Spread-ready style objects for the ChatTextArea component. */
export interface ChatTextAreaTheme {
  /** Outer container wrapping the text area and strategy indicator. */
  readonly container: {
    readonly flexDirection: "column";
  };
  /** Double border wrapper around the text area. */
  readonly borderBox: {
    readonly borderStyle: "double";
    readonly borderColor: string;
    /**
     * Background painted under border glyphs. Matches the inner textarea
     * surface so the border reads as part of the same elevated panel
     * instead of floating against the frame canvas.
     */
    readonly borderBackgroundColor: string;
  };
  /** Strategy indicator row below the text area. */
  readonly strategyRow: {
    readonly flexDirection: "row";
    readonly justifyContent: "space-between";
  };
  /** Strategy label text. */
  readonly strategyLabel: {
    readonly color: string;
    readonly bold: boolean;
  };
  /** Hint text for keybindings. */
  readonly hint: {
    readonly color: string;
    readonly dimColor: boolean;
  };
}

/**
 * Returns themed style objects for the ChatTextArea component.
 * Consumes global tokens via `useTheme()`.
 */
export function useChatTextAreaTheme(): ChatTextAreaTheme {
  const tokens = useTheme();

  return useMemo<ChatTextAreaTheme>(
    () => ({
      container: {
        flexDirection: "column",
      },
      borderBox: {
        borderStyle: "double",
        borderColor: tokens.borders.color,
        borderBackgroundColor: tokens.colors.surface,
      },
      strategyRow: {
        flexDirection: "row",
        justifyContent: "space-between",
      },
      strategyLabel: {
        color: tokens.colors.primary,
        bold: true,
      },
      hint: {
        color: tokens.colors.muted,
        dimColor: true,
      },
    }),
    [tokens],
  );
}
