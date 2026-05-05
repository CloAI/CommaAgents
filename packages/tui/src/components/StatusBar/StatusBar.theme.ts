import { useMemo } from "react";
import type { ChatStatus } from "../../hooks/useChat/useChat.types";
import { useTheme } from "../../theme";

/** Display info for a single status value. */
export interface StatusInfo {
  readonly label: string;
  readonly color: string;
  readonly spinning: boolean;
}

/** Spread-ready style objects for the StatusBar component. */
export interface StatusBarTheme {
  /** Outer container. */
  readonly container: {
    readonly paddingX: number;
    readonly flexDirection: "row";
    readonly gap: number;
  };
  /** Status label text (bold). */
  readonly statusLabel: {
    readonly bold: boolean;
  };
  /** Strategy name text (dim). */
  readonly strategyName: {
    readonly dimColor: boolean;
  };
  /** Error text. */
  readonly errorText: {
    readonly color: string;
  };
  /** Mapping of chat statuses to display info (label, color, spinner). */
  readonly statusMap: Record<ChatStatus, StatusInfo>;
}

/**
 * Returns themed style objects for the StatusBar component.
 * Consumes global tokens via `useTheme()`.
 */
export function useStatusBarTheme(): StatusBarTheme {
  const tokens = useTheme();

  return useMemo<StatusBarTheme>(
    () => ({
      container: {
        paddingX: tokens.spacing.sm,
        flexDirection: "row",
        gap: tokens.spacing.xs,
      },
      statusLabel: {
        bold: tokens.typography.labelBold,
      },
      strategyName: {
        dimColor: tokens.typography.secondaryDim,
      },
      errorText: {
        color: tokens.colors.error,
      },
      statusMap: {
        idle: { label: "Ready", color: tokens.colors.muted, spinning: false },
        pending: { label: "Starting...", color: tokens.colors.warning, spinning: true },
        running: { label: "Running", color: tokens.colors.success, spinning: true },
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
        completed: { label: "Done", color: tokens.colors.success, spinning: false },
        cancelled: { label: "Cancelled", color: tokens.colors.muted, spinning: false },
        error: { label: "Error", color: tokens.colors.error, spinning: false },
      },
    }),
    [tokens],
  );
}
