import { useCallback, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { Button } from "../../design-system/Button";
import { Modal } from "../../design-system/Modal";
import { useCommaAgentsDaemon } from "../../hooks/useCommaAgentsDaemon";
import { splitModel } from "../../hooks/useStrategyModels";
import type { StepRow, StrategyModels } from "../../hooks/useStrategyModels";
import { ModelPicker } from "../ModelPicker";
import type {
  DiscoveredModel,
  DiscoveredProvider,
} from "./StrategyModels.types";
import { StrategyStepRow } from "./StrategyStepRow";
import {
  isConnected,
  modelIssue,
  partitionAgents,
  privacyIssue,
} from "./StrategyModels.utils";
import styles from "./StrategyModels.module.scss";

/** The overrides to edit and how to dismiss the dialog. */
export interface StrategyModelsDialogProps {
  /** Selected strategy's models and override actions. */
  readonly models: StrategyModels;
  /** Dismiss the dialog. */
  readonly onClose: () => void;
}

/** Who the open model picker will change. */
type PickTarget =
  | { readonly type: "agent"; readonly agent: string }
  | { readonly type: "all" };

/**
 * Load providers for status checks and run the model picker for the selected strategy.
 * @param {StrategyModelsDialogProps} props - Component properties.
 * @returns {React.ReactElement} The step list with its picker.
 */
export function StrategyModelsDialog({
  models,
  onClose,
}: StrategyModelsDialogProps) {
  const { data, errors, clientError } = useCommaAgentsDaemon(
    { channel: "core.providers.list" },
    {},
  );
  // The list is loading until its first snapshot, not just the subscription acknowledgement.
  const isLoading = !data && !errors && !clientError;
  const providers = useMemo(() => data?.data.providers ?? [], [data]);
  const providersError = errors?.message ?? clientError?.message;
  const [target, setTarget] = useState<PickTarget | null>(null);
  const [notice, setNotice] = useState<string>();
  const targetRow =
    target?.type === "agent"
      ? models.steps.find((step) => step.agent === target.agent)
      : undefined;
  const parsed =
    targetRow?.effectiveModel === undefined
      ? undefined
      : splitModel(targetRow.effectiveModel);

  const handleChange = useCallback((agent: string) => {
    setNotice(undefined);
    setTarget({ type: "agent", agent });
  }, []);
  const handleSetAll = useCallback(() => {
    setNotice(undefined);
    setTarget({ type: "all" });
  }, []);
  const handleReset = useCallback(
    (agent: string) => {
      setNotice(undefined);
      models.clearOverrides([agent]);
    },
    [models],
  );
  const handleResetAll = useCallback(() => {
    setNotice(undefined);
    models.clearOverrides();
  }, [models]);
  const handleClosePicker = useCallback(() => setTarget(null), []);
  const handlePick = useCallback(
    (provider: DiscoveredProvider, model: DiscoveredModel) => {
      const value = `${provider.id}/${model.id}`;
      if (target?.type === "agent") {
        models.setOverrides({ [target.agent]: value });
      } else {
        const { eligible, skipped } = partitionAgents(models.steps, model);
        models.setOverrides(
          Object.fromEntries(eligible.map((agent) => [agent, value])),
        );
        setNotice(
          skipped.length === 0
            ? undefined
            : `Not applied to ${skipped.join(", ")}: ${model.metadata.name ?? model.id} does not meet their privacy requirements.`,
        );
      }
      setTarget(null);
    },
    [target, models],
  );
  const isDisabled = useCallback(
    (provider: DiscoveredProvider, model: DiscoveredModel) =>
      !isConnected(provider)
        ? "Not connected"
        : privacyIssue(targetRow?.privacy, model),
    [targetRow],
  );

  return (
    <StrategyModelsDialogRender
      strategyName={models.strategyName}
      steps={models.steps}
      providers={providers}
      providersReady={!isLoading && !providersError}
      overriddenCount={models.overriddenCount}
      notice={notice}
      onClose={onClose}
      onChange={handleChange}
      onReset={handleReset}
      onSetAll={handleSetAll}
      onResetAll={handleResetAll}
      picker={
        target && (
          <Modal
            open
            title={
              target.type === "agent"
                ? `Choose model for ${target.agent}`
                : "Choose model for all steps"
            }
            onClose={handleClosePicker}
            className={styles.pickerModal}
          >
            <div className={styles.picker}>
              <ModelPicker
                providers={providers}
                isLoading={isLoading}
                error={providersError}
                onPick={handlePick}
                selected={parsed}
                isDisabled={isDisabled}
              />
            </div>
          </Modal>
        )
      }
    />
  );
}

/** Rows, bulk actions, and the picker for the strategy's steps. */
export interface StrategyModelsDialogRenderProps {
  /** Name of the strategy being edited. */
  readonly strategyName?: string;
  /** Steps in flow order. */
  readonly steps: readonly StepRow[];
  /** Providers used to flag unusable models. */
  readonly providers: readonly DiscoveredProvider[];
  /** Whether provider data is available for flags. */
  readonly providersReady: boolean;
  /** Number of agents with an override. */
  readonly overriddenCount: number;
  /** Result of the last bulk action that needs attention. */
  readonly notice?: string;
  /** Dismiss the dialog. */
  readonly onClose: () => void;
  /** Open the picker for one agent. */
  readonly onChange: (agent: string) => void;
  /** Remove one agent's override. */
  readonly onReset: (agent: string) => void;
  /** Open the picker for every LLM agent. */
  readonly onSetAll: () => void;
  /** Remove every override. */
  readonly onResetAll: () => void;
  /** Model picker dialog while one is open. */
  readonly picker?: ReactNode;
}

/**
 * Render the steps grouped by flow with bulk actions beneath.
 * @param {StrategyModelsDialogRenderProps} props - Component properties.
 * @returns {React.ReactElement} The dialog content.
 */
export function StrategyModelsDialogRender({
  strategyName,
  steps,
  providers,
  providersReady,
  overriddenCount,
  notice,
  onClose,
  onChange,
  onReset,
  onSetAll,
  onResetAll,
  picker,
}: StrategyModelsDialogRenderProps) {
  const flows: { flow: string; depth: number; rows: StepRow[] }[] = [];
  for (const row of steps) {
    const last = flows.at(-1);
    if (last && last.flow === row.flow && last.depth === row.depth) {
      last.rows.push(row);
    } else {
      flows.push({ flow: row.flow, depth: row.depth, rows: [row] });
    }
  }
  return (
    <div className={styles.dialog}>
      {strategyName && (
        <p className={styles.intro}>
          Models used by <strong>{strategyName}</strong>. Changes apply to every
          step that shares an agent.
        </p>
      )}
      <div className={styles.flows}>
        {flows.map((group, index) => (
          <section
            key={`${index}:${group.flow}`}
            className={styles.flow}
            style={{ marginInlineStart: `${group.depth}rem` }}
            aria-label={`${group.flow} flow`}
          >
            <h3 className={styles.flowName}>{group.flow}</h3>
            <ol className={styles.steps}>
              {group.rows.map((row) => (
                <StrategyStepRow
                  key={row.key}
                  row={row}
                  issue={
                    providersReady || row.effectiveModel === undefined
                      ? modelIssue(row, providersReady ? providers : [])
                      : undefined
                  }
                  onChange={onChange}
                  onReset={onReset}
                />
              ))}
            </ol>
          </section>
        ))}
      </div>
      {notice && (
        <p role="status" className={styles.notice}>
          {notice}
        </p>
      )}
      <footer className={styles.footer}>
        <Button className={styles.action} onClick={onSetAll}>
          Set all
        </Button>
        <Button
          className={styles.action}
          onClick={onResetAll}
          disabled={overriddenCount === 0}
        >
          Reset all
        </Button>
        <Button className={styles.done} onClick={onClose}>
          Done
        </Button>
      </footer>
      {picker}
    </div>
  );
}
