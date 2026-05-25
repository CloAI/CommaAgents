import type { StrategyOption } from "../components/StrategyPicker";

/** Look up a `StrategyOption` by its path, label, or value, falling back to the first available. */
export function resolveStrategyOption(
  strategyKey: string,
  strategies: readonly StrategyOption[],
): StrategyOption | null {
  const matched =
    strategies.find((option) => option.value === strategyKey) ??
    strategies.find((option) => option.label === strategyKey) ??
    strategies.find((option) => option.value.endsWith(`${strategyKey}.json`));
  return matched ?? strategies[0] ?? null;
}
