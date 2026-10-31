import { useState } from "react";
import { useSettings } from "../useSettings";
import { useStrategies } from "../useStrategies";
import type {
  SelectedStrategy,
  StrategyChoice,
} from "./useSelectedStrategy.types";
import { resolveSelectedStrategy } from "./useSelectedStrategy.utils";

// TODO: Clean up how strategy selection is decided. The saved default (`settings.strategyPath`)
// is now only read, since a pick is kept per pane for the session and nothing writes the
// default. Decide where the default is set, and whether a pick should seed new panes.
/**
 * Track the strategy chosen for new runs among the discovered ones.
 * A choice lasts for the session and never changes the saved default.
 * @param {StrategyChoice} [choice] - Choice held by the caller; without it the hook keeps its own.
 * @returns {SelectedStrategy} List status, current choice, and a selector.
 */
export function useSelectedStrategy(choice?: StrategyChoice): SelectedStrategy {
  const [ownPath, setOwnPath] = useState<string>();
  const { settings } = useSettings();
  const { status, strategies } = useStrategies();
  const selected = resolveSelectedStrategy(
    strategies,
    (choice ? choice.path : ownPath) ?? settings.strategyPath,
  );
  return {
    status,
    strategies,
    selected,
    select: choice ? choice.onChange : setOwnPath,
  };
}
