import {
  type BoxProps,
  defineTheme,
  type TextProps,
  type ThemeOf,
} from "../../Theme";

/** Memoized themed style objects for the MessageList component. */
export const useMessageListTheme = defineTheme((tokens) => ({
  /** Outer container. */
  container: {
    flexDirection: "column",
    flexGrow: 1,
    paddingX: tokens.spacing.sm,
  } satisfies BoxProps,
  /** Empty state wrapper and text. */
  emptyState: {
    paddingX: tokens.spacing.sm,
    text: {
      dimColor: tokens.typography.secondaryDim,
    } satisfies TextProps,
  } satisfies BoxProps & { readonly text: TextProps },

  /** User-authored message block. */
  userMessage: {
    container: {
      flexDirection: "column",
      marginBottom: tokens.spacing.xs,
    } satisfies BoxProps,
    header: {
      flexDirection: "row",
    } satisfies BoxProps,
    label: {
      bold: tokens.typography.labelBold,
      color: tokens.colors.userMessage,
    } satisfies TextProps,
    body: {
      paddingLeft: tokens.spacing.md,
    } satisfies BoxProps,
    bodyText: {
      wrap: "wrap",
    } satisfies TextProps,
    borderColor: tokens.colors.userMessage,
  },

  /** Agent-authored message block. */
  agentMessage: {
    container: {
      flexDirection: "column",
      marginBottom: tokens.spacing.xs,
    } satisfies BoxProps,
    header: {
      flexDirection: "row",
    } satisfies BoxProps,
    label: {
      bold: tokens.typography.labelBold,
      color: tokens.colors.agentMessage,
    } satisfies TextProps,
    headerDetail: {
      model: {
        color: tokens.colors.secondary,
        dimColor: tokens.typography.secondaryDim,
      } satisfies TextProps,
      context: {
        color: tokens.colors.warning,
        bold: tokens.typography.labelBold,
      } satisfies TextProps,
      /** Threshold colors for the context-usage fill bar, by fraction used. */
      contextBar: {
        low: tokens.colors.success,
        medium: tokens.colors.warning,
        high: tokens.colors.error,
      },
      time: {
        color: tokens.colors.muted,
        dimColor: tokens.typography.secondaryDim,
      } satisfies TextProps,
      separator: {
        color: tokens.colors.muted,
        dimColor: tokens.typography.secondaryDim,
      } satisfies TextProps,
    },
    body: {
      flexDirection: "column",
      paddingLeft: tokens.spacing.md,
    } satisfies BoxProps,
    textSegment: {
      wrap: "wrap",
    } satisfies TextProps,
    streamingCursor: {
      dimColor: tokens.typography.secondaryDim,
    } satisfies TextProps,
    toolCall: {
      container: {
        flexDirection: "column",
        marginTop: tokens.spacing.xs,
      } satisfies BoxProps,
      header: {
        bold: tokens.typography.labelBold,
        color: tokens.colors.primary,
      } satisfies TextProps,
      label: {
        dimColor: tokens.typography.secondaryDim,
      } satisfies TextProps,
      args: {
        dimColor: tokens.typography.secondaryDim,
      } satisfies TextProps,
    },
    toolResult: {
      container: {
        flexDirection: "column",
        marginTop: tokens.spacing.xs,
      } satisfies BoxProps,
      header: {
        bold: tokens.typography.labelBold,
        color: tokens.colors.success,
      } satisfies TextProps,
      output: {
        dimColor: tokens.typography.secondaryDim,
        wrap: "wrap",
      } satisfies TextProps,
    },
    thinking: {
      container: {
        flexDirection: "column",
        marginTop: tokens.spacing.xs,
      } satisfies BoxProps,
      header: {
        bold: tokens.typography.labelBold,
        color: tokens.colors.muted,
      } satisfies TextProps,
      text: {
        italic: true,
        dimColor: tokens.typography.secondaryDim,
        wrap: "wrap",
      } satisfies TextProps,
    },
    borderColor: tokens.colors.agentMessage,
  },

  /** System-authored message block. */
  systemMessage: {
    container: {
      flexDirection: "row",
      marginBottom: tokens.spacing.xs,
    } satisfies BoxProps,
    bullet: {
      color: tokens.colors.systemMessage,
      dimColor: tokens.typography.secondaryDim,
    } satisfies TextProps,
    text: {
      color: tokens.colors.systemMessage,
      dimColor: tokens.typography.secondaryDim,
      wrap: "wrap",
    } satisfies TextProps,
    borderColor: tokens.colors.systemMessage,
  },

  /** Role-based colors for sender name (kept for backwards compatibility). */
  roles: {
    user: {
      bold: tokens.typography.labelBold,
      color: tokens.colors.userMessage,
    } satisfies TextProps,
    agent: {
      bold: tokens.typography.labelBold,
      color: tokens.colors.agentMessage,
    } satisfies TextProps,
    system: {
      bold: tokens.typography.labelBold,
      color: tokens.colors.systemMessage,
    } satisfies TextProps,
  },
}));

/** Resolved style object shape returned by {@link useMessageListTheme}. */
export type MessageListTheme = ThemeOf<typeof useMessageListTheme>;

/** Per-role text style. */
export type RoleStyle = MessageListTheme["roles"]["user"];

/** Style for an inline label badge. */
export type BadgeStyle = MessageListTheme["userMessage"]["label"];
