import type { SelectedStrategy } from "../../useSelectedStrategy";
import type { StrategyItem } from "../../useStrategies";

/** A user selection awaiting the active-work decision. */
export interface PendingStrategyChange {
  readonly strategy: StrategyItem;
  /** Roles to merge into the run's own, or `null` to clear them. */
  readonly modelRoles?: Readonly<Record<string, string>> | null;
}

/** Run-owned strategy controls and their explicit switching actions. */
export interface RunStrategy extends SelectedStrategy {
  /** Choose models for roles in this conversation only. */
  readonly changeModels: (models: Readonly<Record<string, string>>) => void;
  /** Drop this conversation's role choices so the daemon's apply again. */
  readonly resetModels: () => void;
  /** Selection requiring an explicit decision about active work. */
  readonly pending: PendingStrategyChange | undefined;
  /** Dismiss without stopping or queuing a switch. */
  readonly wait: () => void;
  /** Stop active work and apply the pending selection. */
  readonly stopAndSwitch: () => void;
  /** Failure from the latest selection attempt. */
  readonly error: string | undefined;
  /** Whether the daemon is processing a selection. */
  readonly isLoading: boolean;
}
