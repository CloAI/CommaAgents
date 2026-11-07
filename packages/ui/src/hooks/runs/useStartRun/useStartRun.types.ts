import type { StrategyItem } from "../../useStrategies";

/** Starting a new run from a strategy and a prompt. */
export interface StartRun {
  /** Prepare and start a run; resolves with its ID, or undefined after recording why it failed. */
  readonly start: (
    strategy: StrategyItem | undefined,
    prompt: string,
  ) => Promise<string | undefined>;
  /** Whether a run is being prepared or started. */
  readonly isStarting: boolean;
  /** Why the last attempt failed. */
  readonly error: string | undefined;
  /** Model roles the strategy needs that the daemon has not configured; set them, then start again. */
  readonly missingRoles: readonly string[] | undefined;
  /** Forget the missing roles without configuring them. */
  readonly dismissMissingRoles: () => void;
}
