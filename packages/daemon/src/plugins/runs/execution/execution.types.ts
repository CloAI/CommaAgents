import type {
  InputCollector,
  LaunchStrategyHandle,
  LoadedStrategy,
} from "@comma-agents/core";
import type { HubManager } from "@comma-agents/core/hub";
import type { StrategyLoaderInputs } from "../runs.types";

/** @internal A root or child strategy and the resources acquired while loading it. */
export interface LoadedRunScope {
  readonly strategy: LoadedStrategy;
  readonly disposers: Array<() => Promise<void> | void>;
}

/** @internal Inputs for loading a strategy after run preparations finish. */
export interface LoadRunStrategyOptions {
  readonly strategyPath: string;
  readonly manifestPath?: string;
  readonly modelOverride?: string;
  readonly runId: string;
  readonly inputCollector: InputCollector;
  readonly launchStrategy: LaunchStrategyHandle;
  readonly strategyInputs: Partial<StrategyLoaderInputs>;
  readonly hubManager?: HubManager;
}
