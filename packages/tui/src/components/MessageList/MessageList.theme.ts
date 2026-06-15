import { useMemo } from "react";

import { useTheme } from "../../Theme";

/** Per-role text style (color + bold). */
export interface RoleStyle {
  readonly bold: boolean;
  readonly color: string;
}

/** Style for an inline label badge (e.g. "you", "system", agent name). */
export interface BadgeStyle {
  readonly bold: boolean;
  readonly color: string;
}

/** Spread-ready style objects for the MessageList component. */
export interface MessageListTheme {
  /** Outer container. */
  readonly container: {
    readonly flexDirection: "column";
    readonly flexGrow: number;
    readonly paddingX: number;
  };
  /** Empty state wrapper. */
  readonly emptyState: {
    readonly paddingX: number;
    readonly text: {
      readonly dimColor: boolean;
    };
  };

  /** User-authored message block. */
  readonly userMessage: {
    /** Outer column container. */
    readonly container: {
      readonly flexDirection: "column";
      readonly flex: 1;
      readonly marginBottom: number;
    };
    /** Header row with the "you" label. */
    readonly header: {
      readonly flexDirection: "row";
    };
    /** "you" label style. */
    readonly label: BadgeStyle;
    /** Body row containing the prompt text. */
    readonly body: {
      readonly paddingLeft: number;
    };
    /** Body text style. */
    readonly bodyText: {
      readonly wrap: "wrap";
    };
    /** Color used for the wrapping `BorderedPanel` border + header label. */
    readonly borderColor: string;
  };

  /** Agent-authored message block. */
  readonly agentMessage: {
    readonly container: {
      readonly flexDirection: "column";
      readonly flex: 1;
      readonly marginBottom: number;
    };
    readonly header: {
      readonly flexDirection: "row";
    };
    readonly label: BadgeStyle;
    readonly headerDetail: {
      readonly model: {
        readonly color: string;
        readonly dimColor: boolean;
      };
      readonly context: {
        readonly color: string;
        readonly bold: boolean;
      };
      readonly time: {
        readonly color: string;
        readonly dimColor: boolean;
      };
      readonly separator: {
        readonly color: string;
        readonly dimColor: boolean;
      };
    };
    readonly body: {
      readonly flexDirection: "column";
      readonly paddingLeft: number;
    };
    /** Plain text segment style. */
    readonly textSegment: {
      readonly wrap: "wrap";
    };
    /** Streaming cursor indicator. */
    readonly streamingCursor: {
      readonly dimColor: boolean;
    };
    /** Tool-call row container. */
    readonly toolCall: {
      readonly container: {
        readonly flexDirection: "column";
        readonly marginTop: number;
      };
      readonly header: BadgeStyle;
      readonly label: {
        readonly dimColor: boolean;
      };
      readonly args: {
        readonly dimColor: boolean;
      };
    };
    /** Tool-result row container. */
    readonly toolResult: {
      readonly container: {
        readonly flexDirection: "column";
        readonly marginTop: number;
      };
      readonly header: BadgeStyle;
      readonly output: {
        readonly dimColor: boolean;
        readonly wrap: "wrap";
      };
    };
    /** Reasoning / "thinking" block. */
    readonly thinking: {
      readonly container: {
        readonly flexDirection: "column";
        readonly marginTop: number;
      };
      readonly header: BadgeStyle;
      readonly text: {
        readonly italic: true;
        readonly dimColor: boolean;
        readonly wrap: "wrap";
      };
    };
    /** Color used for the wrapping `BorderedPanel` border + header label. */
    readonly borderColor: string;
  };

  /** System-authored message block. */
  readonly systemMessage: {
    readonly container: {
      readonly flexDirection: "row";
      readonly flex: 1;
      readonly marginBottom: number;
    };
    readonly bullet: {
      readonly color: string;
      readonly dimColor: boolean;
    };
    readonly text: {
      readonly color: string;
      readonly dimColor: boolean;
      readonly wrap: "wrap";
    };
    /** Color used for the wrapping `BorderedPanel` border + header label. */
    readonly borderColor: string;
  };

  /** Role-based colors for sender name (kept for backwards compatibility). */
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
        flexGrow: 1,
        paddingX: tokens.spacing.sm,
      },
      emptyState: {
        paddingX: tokens.spacing.sm,
        text: {
          dimColor: tokens.typography.secondaryDim,
        },
      },

      userMessage: {
        container: {
          flexDirection: "column",
          marginBottom: tokens.spacing.xs,
        },
        header: {
          flexDirection: "row",
        },
        label: {
          bold: tokens.typography.labelBold,
          color: tokens.colors.userMessage,
        },
        body: {
          paddingLeft: tokens.spacing.md,
        },
        bodyText: {
          wrap: "wrap",
        },
        borderColor: tokens.colors.userMessage,
      },

      agentMessage: {
        container: {
          flexDirection: "column",
          marginBottom: tokens.spacing.xs,
        },
        header: {
          flexDirection: "row",
        },
        label: {
          bold: tokens.typography.labelBold,
          color: tokens.colors.agentMessage,
        },
        headerDetail: {
          model: {
            color: tokens.colors.secondary,
            dimColor: tokens.typography.secondaryDim,
          },
          context: {
            color: tokens.colors.warning,
            bold: tokens.typography.labelBold,
          },
          time: {
            color: tokens.colors.muted,
            dimColor: tokens.typography.secondaryDim,
          },
          separator: {
            color: tokens.colors.muted,
            dimColor: tokens.typography.secondaryDim,
          },
        },
        body: {
          flexDirection: "column",
          paddingLeft: tokens.spacing.md,
        },
        textSegment: {
          wrap: "wrap",
        },
        streamingCursor: {
          dimColor: tokens.typography.secondaryDim,
        },
        toolCall: {
          container: {
            flexDirection: "column",
            marginTop: tokens.spacing.xs,
          },
          header: {
            bold: tokens.typography.labelBold,
            color: tokens.colors.primary,
          },
          label: {
            dimColor: tokens.typography.secondaryDim,
          },
          args: {
            dimColor: tokens.typography.secondaryDim,
          },
        },
        toolResult: {
          container: {
            flexDirection: "column",
            marginTop: tokens.spacing.xs,
          },
          header: {
            bold: tokens.typography.labelBold,
            color: tokens.colors.success,
          },
          output: {
            dimColor: tokens.typography.secondaryDim,
            wrap: "wrap",
          },
        },
        thinking: {
          container: {
            flexDirection: "column",
            marginTop: tokens.spacing.xs,
          },
          header: {
            bold: tokens.typography.labelBold,
            color: tokens.colors.muted,
          },
          text: {
            italic: true,
            dimColor: tokens.typography.secondaryDim,
            wrap: "wrap",
          },
        },
        borderColor: tokens.colors.agentMessage,
      },

      systemMessage: {
        container: {
          flexDirection: "row",
          marginBottom: tokens.spacing.xs,
        },
        bullet: {
          color: tokens.colors.systemMessage,
          dimColor: tokens.typography.secondaryDim,
        },
        text: {
          color: tokens.colors.systemMessage,
          dimColor: tokens.typography.secondaryDim,
          wrap: "wrap",
        },
        borderColor: tokens.colors.systemMessage,
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
