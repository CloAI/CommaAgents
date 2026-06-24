import type { DiscoveredStrategy } from "@comma-agents/core";

export type StrategyDiscoveryStatus = "loading" | "ready" | "error";

export interface StrategyDiscoveryContextValue {
  readonly strategies: readonly DiscoveredStrategy[];
  readonly status: StrategyDiscoveryStatus;
  readonly error: string | null;
  readonly refresh: () => Promise<void>;
}
