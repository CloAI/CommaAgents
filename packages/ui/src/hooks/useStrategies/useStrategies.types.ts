import type { DaemonCommandMap } from "@comma-agents/daemon/protocol";

/** One strategy a run can be configured with. */
export type StrategyItem =
  DaemonCommandMap["core.strategies.list"]["result"]["strategies"][number];

/** Availability of the strategy list. */
export type StrategyStatus = "loading" | "error" | "empty" | "ready";

/** Discovered strategies and whether the list is usable. */
export interface Strategies {
  /** Whether the list is loading, failed, empty, or usable. */
  readonly status: StrategyStatus;
  /** Strategies in discovery priority order. */
  readonly strategies: readonly StrategyItem[];
}
