import type { Strategies } from "../useStrategies";

/** Discovered strategies and the one chosen for new runs. */
export interface SelectedStrategy extends Strategies {
  /** Saved strategy when still discovered, otherwise the first one. */
  readonly selected: Strategies["strategies"][number] | undefined;
  /** Choose a strategy by path and persist the choice. */
  readonly select: (path: string) => void;
}

/** A strategy choice held by the caller, such as per pane, instead of inside the hook. */
export interface StrategyChoice {
  /** Path the caller last chose, if any. */
  readonly path: string | undefined;
  /** Remember a choice. */
  readonly onChange: (path: string) => void;
}
