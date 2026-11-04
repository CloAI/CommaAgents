import { useCallback, useMemo, useState } from "react";
import { useCommaAgentsDaemon } from "../useCommaAgentsDaemon";
import { daemonLogs } from "../useLogBucket/logger";
import { useSettings } from "../useSettings";
import type {
  StrategyModels,
  StrategyModelsStatus,
  StrategyModelBinding,
} from "./useStrategyModels.types";
import { buildStepRows, findUniform } from "./useStrategyModels.utils";

/** Shared so an empty override set keeps one identity between renders. */
const NO_OVERRIDES: Readonly<Record<string, string>> = {};

/**
 * Describe a strategy's models and keep the user's per-agent overrides.
 * New-chat overrides are saved by strategy path; a binding saves changes to its conversation instead.
 * @param {string} strategyPath - Path of the strategy to describe.
 * @param {StrategyModelBinding} [binding] - Conversation-owned settings and persistence action.
 * @returns {StrategyModels} Status, steps with effective models, and override actions.
 */
export function useStrategyModels(
  strategyPath: string,
  binding?: StrategyModelBinding,
): StrategyModels {
  const { settings, saveSettings } = useSettings();
  const { data, errors, clientError } = useCommaAgentsDaemon(
    { command: "core.strategies.describe" },
    { strategyPath },
  );
  // Keeps the overrides for this session even when they cannot be saved.
  const [sessionOverrides, setSessionOverrides] =
    useState<Readonly<Record<string, string>>>();
  const storedOverrides =
    binding?.overrides ??
    sessionOverrides ??
    settings.modelOverrides?.[strategyPath] ??
    NO_OVERRIDES;
  const overrides = useMemo(() => {
    const uniformModel = binding?.modelOverride;
    return uniformModel && data
      ? {
          ...Object.fromEntries(
            data.agents
              .filter((agent) => agent.kind === "llm")
              .map((agent) => [agent.name, uniformModel]),
          ),
          ...storedOverrides,
        }
      : storedOverrides;
  }, [binding?.modelOverride, data, storedOverrides]);
  const steps = useMemo(
    () => (data ? buildStepRows(data, overrides) : []),
    [data, overrides],
  );
  const llmAgents = useMemo(
    () => [
      ...new Set(
        steps.filter((step) => step.kind === "llm").map((step) => step.agent),
      ),
    ],
    [steps],
  );
  const uniform = useMemo(() => findUniform(steps), [steps]);
  const overriddenCount = llmAgents.filter(
    (agent) => overrides[agent] !== undefined,
  ).length;
  const status: StrategyModelsStatus =
    errors || clientError
      ? "error"
      : !data
        ? "loading"
        : llmAgents.length === 0
          ? "none"
          : "ready";

  const commit = useCallback(
    (next: Readonly<Record<string, string>>) => {
      // Drop entries for agents the strategy no longer has.
      const known = new Set(data?.agents.map((agent) => agent.name));
      const pruned = Object.fromEntries(
        Object.entries(next).filter(([agent]) => known.has(agent)),
      );
      if (binding) {
        binding.onChange(pruned);
        return;
      }
      const result = saveSettings({
        ...settings,
        modelOverrides: { ...settings.modelOverrides, [strategyPath]: pruned },
      });
      if (result.type === "error") {
        setSessionOverrides(pruned);
        daemonLogs.error(result.message, "model overrides");
      } else {
        setSessionOverrides(undefined);
      }
    },
    [data, settings, saveSettings, strategyPath, binding],
  );
  const setOverrides = useCallback(
    (models: Readonly<Record<string, string>>) =>
      commit({ ...overrides, ...models }),
    [commit, overrides],
  );
  const clearOverrides = useCallback(
    (agents?: readonly string[]) =>
      commit(
        agents === undefined
          ? {}
          : Object.fromEntries(
              Object.entries(overrides).filter(
                ([agent]) => !agents.includes(agent),
              ),
            ),
      ),
    [commit, overrides],
  );

  return {
    status,
    ...(data ? { strategyName: data.name } : {}),
    steps,
    ...(uniform ? { uniform } : {}),
    agentCount: llmAgents.length,
    overriddenCount,
    setOverrides,
    clearOverrides,
  };
}
