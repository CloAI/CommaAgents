import type {
  InputCollector,
  LaunchStrategyHandle,
  StrategySwitchHandle,
} from "@comma-agents/core";
import type { HubManager } from "@comma-agents/core/hub";
import type { HarnessSettings, StrategyLoaderInputs } from "../../runs.types";

/** @internal Inputs for loading a strategy after run preparations finish. */
export interface LoadRunStrategyOptions {
  readonly strategyPath: string;
  readonly manifestPath?: string;
  readonly modelOverride?: string;
  readonly modelOverrides?: Readonly<Record<string, string>>;
  readonly runId: string;
  readonly inputCollector: InputCollector;
  readonly launchStrategy: LaunchStrategyHandle;
  readonly requestStrategySwitch?: StrategySwitchHandle;
  readonly strategyInputs: StrategyLoaderInputs;
  readonly hubManager?: HubManager;
  readonly cwd: string;
  readonly harness?: HarnessSettings;
}
