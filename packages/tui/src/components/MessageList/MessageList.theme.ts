import { useMemo } from "react";

import { useTheme } from "../../theme";

/** Per-role text style (color + bold). */
export interface RoleStyle {
  readonly bold: boolean;
  readonly color: string;
}

/** Spread-ready style objects for the MessageList component. */
export interface MessageListTheme {
  /** Outer container. */
  readonly container: {
    readonly flexDirection: "column";
    readonly paddingX: number;
  };
  /** Empty state wrapper. */
  readonly emptyState: {
    readonly paddingX: number;
    readonly text: {
      readonly dimColor: boolean;
    };
  };
  /** Individual message row. */
  readonly messageRow: {
    readonly flexDirection: "row";
    readonly marginBottom: number;
  };
  /** Separator between sender name and text. */
  readonly messageSeparator: {
    readonly dimColor: boolean;
  };
  /** Message body text. */
  readonly messageBody: {
    readonly wrap: "wrap";
  };
  /** Streaming cursor indicator. */
  readonly streamingCursor: {
    readonly dimColor: boolean;
  };
  /** Role-based colors for sender name. */
  readonly roles: {
    readonly user: RoleStyle;
    readonly agent: RoleStyle;
    readonly system: RoleStyle;
  };
}

/**
 * Returns themed style objects for the MessageList component.
 * Consumes global tokens via `useTheme()`.
 */
export function useMessageListTheme(): MessageListTheme {
  const tokens = useTheme();

  return useMemo<MessageListTheme>(
    () => ({
      container: {
        flexDirection: "column",
        paddingX: tokens.spacing.sm,
      },
      emptyState: {
        paddingX: tokens.spacing.sm,
        text: {
          dimColor: tokens.typography.secondaryDim,
        },
      },
      messageRow: {
        flexDirection: "row",
        marginBottom: tokens.spacing.none,
      },
      messageSeparator: {
        dimColor: tokens.typography.secondaryDim,
      },
      messageBody: {
        wrap: "wrap",
      },
      streamingCursor: {
        dimColor: tokens.typography.secondaryDim,
      },
      roles: {
        user: {
          bold: tokens.typography.labelBold,
          color: tokens.colors.userMessage,
        },
        agent: {
          bold: tokens.typography.labelBold,
          color: tokens.colors.agentMessage,
        },
        system: {
          bold: tokens.typography.labelBold,
          color: tokens.colors.systemMessage,
        },
      },
    }),
    [tokens],
  );
}
