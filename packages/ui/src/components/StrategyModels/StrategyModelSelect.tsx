import { useCallback, useMemo } from "react";
import { Button } from "../../design-system/Button";
import { Select } from "../../design-system/Select";
import type { SelectOption } from "../../design-system/Select";
import { useCommaAgentsDaemon } from "../../hooks/useCommaAgentsDaemon";
import type {
  StrategyModels,
  UniformModel,
} from "../../hooks/useStrategyModels";
import { modelOptions } from "./StrategyModels.utils";
import styles from "./StrategyModels.module.scss";

/** The shared model to replace and the way to reach per-step detail. */
export interface StrategyModelSelectProps {
  /** Selected strategy's models and override actions. */
  readonly models: StrategyModels;
  /** The one model every LLM agent currently uses. */
  readonly uniform: UniformModel;
  /** Open the per-step dialog. */
  readonly onOpenSteps: () => void;
}

/**
 * Load providers and replace the shared model for every agent in one choice.
 * @param {StrategyModelSelectProps} props - Component properties.
 * @returns {React.ReactElement} The quick model selector.
 */
export function StrategyModelSelect({
  models,
  uniform,
  onOpenSteps,
}: StrategyModelSelectProps) {
  const { data, errors, clientError, isLoading } = useCommaAgentsDaemon(
    { command: "core.providers.list" },
    { live: false },
  );
  const { options, groups } = useMemo(
    () => modelOptions(data?.providers ?? [], uniform.privacy),
    [data, uniform.privacy],
  );
  const handleChange = useCallback(
    (model: string) =>
      models.setOverrides(
        Object.fromEntries(uniform.agents.map((agent) => [agent, model])),
      ),
    [models, uniform.agents],
  );
  const handleReset = useCallback(
    () => models.clearOverrides(uniform.agents),
    [models, uniform.agents],
  );
  return (
    <StrategyModelSelectRender
      model={uniform.model}
      status={
        errors || clientError
          ? "error"
          : isLoading
            ? "loading"
            : options.length === 0
              ? "empty"
              : "ready"
      }
      options={options}
      groups={groups}
      overridden={uniform.overridden}
      onChange={handleChange}
      onReset={handleReset}
      onOpenSteps={onOpenSteps}
    />
  );
}

/** Choices and state of the quick model selector. */
export interface StrategyModelSelectRenderProps {
  /** Model all agents currently use. */
  readonly model: string | undefined;
  /** Whether the choices are loading, failed, absent, or usable. */
  readonly status: "loading" | "error" | "empty" | "ready";
  /** Models of connected providers. */
  readonly options: readonly SelectOption[];
  /** Provider names in display order. */
  readonly groups: readonly string[];
  /** Whether the shown model replaces the strategy's own. */
  readonly overridden: boolean;
  /** Replace the model for every agent. */
  readonly onChange: (model: string) => void;
  /** Restore the strategy's own models. */
  readonly onReset: () => void;
  /** Open the per-step dialog. */
  readonly onOpenSteps: () => void;
}

/**
 * Render the dropdown with its override indicator and actions.
 * @param {StrategyModelSelectRenderProps} props - Component properties.
 * @returns {React.ReactElement} The selector row.
 */
export function StrategyModelSelectRender({
  model,
  status,
  options,
  groups,
  overridden,
  onChange,
  onReset,
  onOpenSteps,
}: StrategyModelSelectRenderProps) {
  const current = model ?? "No model set";
  return (
    <div className={styles.quick}>
      <Select
        label="Model"
        options={options}
        value={model}
        onChange={onChange}
        placeholder={
          status === "error"
            ? "Models unavailable"
            : status === "empty"
              ? "No connected providers - connect one in Settings > Providers"
              : current
        }
        disabled={status !== "ready"}
        triggerLabel={current}
        searchable
        searchPlaceholder="Search models..."
        groupOrder={groups}
        emptyMessage="No models match"
      />
      {overridden && (
        <>
          <span className={styles.tag} data-tone="primary">
            Overridden
          </span>
          <Button
            className={styles.action}
            aria-label="Reset model"
            onClick={onReset}
          >
            Reset
          </Button>
        </>
      )}
      <Button
        className={styles.action}
        title="Edit models per step"
        onClick={onOpenSteps}
      >
        Steps
      </Button>
    </div>
  );
}
