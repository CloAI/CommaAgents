import { useEffect } from "react";
import { useCommaAgentsDaemon } from "../useCommaAgentsDaemon";
import { daemonLogs } from "../useLogBucket/logger";
import type { Strategies, StrategyItem } from "./useStrategies.types";

const NO_STRATEGIES: readonly StrategyItem[] = [];

/**
 * Discover installed strategies and log the ones that were skipped.
 * @returns {Strategies} List status and strategies in priority order.
 */
export function useStrategies(): Strategies {
  const { data, errors, clientError } = useCommaAgentsDaemon(
    { command: "core.strategies.list" },
    {},
  );
  const strategies = data?.strategies ?? NO_STRATEGIES;
  useEffect(() => {
    for (const warning of data?.warnings ?? [])
      daemonLogs.warn(`Skipped strategy: ${warning.reason}`, warning.path);
  }, [data]);
  return {
    status:
      errors || clientError
        ? "error"
        : !data
          ? "loading"
          : strategies.length === 0
            ? "empty"
            : "ready",
    strategies,
  };
}
