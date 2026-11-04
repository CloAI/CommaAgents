import { useCallback, useRef, useState } from "react";
import { useDaemonMutation } from "../../useDaemonMutation";
import { useSettings } from "../../useSettings";
import type { StrategyItem } from "../../useStrategies";
import type { StartRun } from "./useStartRun.types";

/**
 * Prepare a run with the strategy's saved model choices and start it with a prompt.
 * @returns {StartRun} Start action and its progress.
 */
export function useStartRun(): StartRun {
  const [isStarting, setStarting] = useState(false);
  const [error, setError] = useState<string>();
  const starting = useRef(false);
  const { settings } = useSettings();
  const { attempt: prepare } = useDaemonMutation("runs.prepare");
  const { attempt: begin } = useDaemonMutation("runs.start");
  const start = useCallback(
    async (strategy: StrategyItem | undefined, prompt: string) => {
      if (starting.current) {
        return undefined;
      }
      if (!strategy) {
        setError("Choose a strategy first.");
        return undefined;
      }
      starting.current = true;
      setStarting(true);
      setError(undefined);
      const overrides = settings.modelOverrides?.[strategy.path];
      const prepared = await prepare({
        configuration: {
          strategyPath: strategy.path,
          manifestPath: strategy.manifestPath,
          modelOverrides:
            overrides && Object.keys(overrides).length ? overrides : undefined,
        },
      });
      const started = prepared.ok
        ? await begin({ runId: prepared.data.runId, input: prompt })
        : prepared;
      starting.current = false;
      setStarting(false);
      if (started.ok && prepared.ok) {
        return prepared.data.runId;
      }
      setError(started.ok ? undefined : started.error.message);
      return undefined;
    },
    [settings.modelOverrides, prepare, begin],
  );
  return { start, isStarting, error };
}
