import type { SelectedStrategy } from "../../useSelectedStrategy";
import type { StrategyItem } from "../../useStrategies";

/** A user selection awaiting the active-work decision. */
export interface PendingStrategyChange {
  readonly strategy: StrategyItem;
  readonly models?: Readonly<Record<string, string>>;
}

/** Run-owned strategy controls and their explicit switching actions. */
export interface RunStrategy extends SelectedStrategy {
  /** Persist model settings for this conversation. */
  readonly changeModels: (models: Readonly<Record<string, string>>) => void;
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
