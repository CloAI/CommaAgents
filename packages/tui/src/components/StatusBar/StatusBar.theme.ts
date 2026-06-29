import type { ChatStatus } from "../../hooks/useChat/useChat.types";
import {
  type BoxProps,
  defineTheme,
  type TextProps,
  type ThemeOf,
} from "../../Theme";

/** Display info for a single status value. */
export interface StatusInfo {
  readonly label: string;
  readonly color: string;
  readonly spinning: boolean;
}

/**
 * Memoized themed style objects for the StatusBar component.
 */
export const useStatusBarTheme = defineTheme((tokens) => ({
  /** Outer container. */
  container: {
    paddingX: tokens.spacing.sm,
    flexDirection: "row",
    gap: tokens.spacing.xs,
  } satisfies BoxProps,
  /** Status label text (bold). */
  statusLabel: {
    bold: tokens.typography.labelBold,
  } satisfies TextProps,
  /** Strategy name text (dim). */
  strategyName: {
    dimColor: tokens.typography.secondaryDim,
  } satisfies TextProps,
  /** Error text. */
  errorText: {
    color: tokens.colors.error,
  } satisfies TextProps,
  /** Mapping of chat statuses to display info (label, color, spinner). */
  statusMap: {
    idle: { label: "Ready", color: tokens.colors.muted, spinning: false },
    pending: {
      label: "Starting...",
      color: tokens.colors.warning,
      spinning: true,
    },
    running: {
      label: "Running",
      color: tokens.colors.success,
      spinning: true,
    },
    waiting_input: {
      label: "Waiting for input",
      color: tokens.colors.waitingInput,
      spinning: false,
    },
    waiting_permission: {
      label: "Permission required",
      color: tokens.colors.warning,
      spinning: false,
    },
    waiting_question: {
      label: "Waiting for answer",
      color: tokens.colors.waitingInput,
      spinning: false,
    },
    completed: {
      label: "Done",
      color: tokens.colors.success,
      spinning: false,
    },
    cancelled: {
      label: "Cancelled",
      color: tokens.colors.muted,
      spinning: false,
    },
    error: { label: "Error", color: tokens.colors.error, spinning: false },
  } satisfies Record<ChatStatus, StatusInfo>,
}));

/** Resolved style object shape returned by {@link useStatusBarTheme}. */
export type StatusBarTheme = ThemeOf<typeof useStatusBarTheme>;
