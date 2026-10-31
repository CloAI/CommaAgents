import type { StrategyItem } from "../useStrategies";

/**
 * Prefer the requested strategy, falling back to the highest-priority one.
 * @param {readonly StrategyItem[]} strategies - Discovered strategies in priority order.
 * @param {string | undefined} path - Preferred strategy path, possibly stale.
 * @returns {StrategyItem | undefined} The strategy to use, or undefined when none exist.
 */
export function resolveSelectedStrategy(
  strategies: readonly StrategyItem[],
  path: string | undefined,
): StrategyItem | undefined {
  return strategies.find((strategy) => strategy.path === path) ?? strategies[0];
}
