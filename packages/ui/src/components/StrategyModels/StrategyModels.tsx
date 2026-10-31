import { ChevronDown } from "lucide-react";
import { useCallback, useState } from "react";
import { Modal } from "../../design-system/Modal";
import { useStrategyModels } from "../../hooks/useStrategyModels";
import type {
  StrategyModelsStatus,
  StrategyModelBinding,
} from "../../hooks/useStrategyModels";
import { StrategyModelSelect } from "./StrategyModelSelect";
import { StrategyModelsDialog } from "./StrategyModelsDialog";
import styles from "./StrategyModels.module.scss";

/** The strategy whose models are shown. */
export interface StrategyModelsProps {
  /** Path of the selected strategy; undefined while none is available. */
  readonly strategyPath: string | undefined;
  /** Overrides belonging to this conversation, when editing an existing run. */
  readonly binding?: StrategyModelBinding;
}

/**
 * Show how many models the selected strategy uses and open their editor.
 * @param {StrategyModelsProps} props - Component properties.
 * @returns {React.ReactElement} The quick selector or the trigger, with its dialog while open.
 */
export function StrategyModels({ strategyPath, binding }: StrategyModelsProps) {
  // Keyed so each strategy starts with fresh status and session overrides.
  return strategyPath === undefined ? (
    <StrategyModelsRender status="none" agentCount={0} overriddenCount={0} />
  ) : (
    <SelectedStrategyModels
      key={strategyPath}
      strategyPath={strategyPath}
      binding={binding}
    />
  );
}

/**
 * Describe one strategy and own the editor's open state.
 * @param {{strategyPath: string}} props - Component properties.
 * @returns {React.ReactElement} The quick selector or trigger with its dialog.
 */
function SelectedStrategyModels({
  strategyPath,
  binding,
}: {
  strategyPath: string;
  binding?: StrategyModelBinding;
}) {
  const models = useStrategyModels(strategyPath, binding);
  const [open, setOpen] = useState(false);
  const handleOpen = useCallback(() => setOpen(true), []);
  const handleClose = useCallback(() => setOpen(false), []);
  // The dialog stays in one place so switching controls never remounts it.
  return (
    <>
      {models.status === "ready" && models.uniform ? (
        <StrategyModelSelect
          models={models}
          uniform={models.uniform}
          onOpenSteps={handleOpen}
        />
      ) : (
        <StrategyModelsRender
          status={models.status}
          agentCount={models.agentCount}
          overriddenCount={models.overriddenCount}
          onOpen={handleOpen}
        />
      )}
      {open && (
        <Modal
          open
          title="Strategy models"
          onClose={handleClose}
          className={styles.modal}
        >
          <StrategyModelsDialog models={models} onClose={handleClose} />
        </Modal>
      )}
    </>
  );
}

/** Counts to summarize and the handler that opens the editor. */
export interface StrategyModelsRenderProps {
  /** Whether models are loading, unavailable, absent, or ready. */
  readonly status: StrategyModelsStatus;
  /** Distinct LLM agents the strategy uses. */
  readonly agentCount: number;
  /** Agents with an override. */
  readonly overriddenCount: number;
  /** Open the editor. */
  readonly onOpen?: () => void;
}

/**
 * Render the summary trigger.
 * @param {StrategyModelsRenderProps} props - Component properties.
 * @returns {React.ReactElement} The trigger.
 */
export function StrategyModelsRender({
  status,
  agentCount,
  overriddenCount,
  onOpen,
}: StrategyModelsRenderProps) {
  const text =
    status === "loading"
      ? "Loading models..."
      : status === "error"
        ? "Models unavailable"
        : status === "none"
          ? "No models"
          : `${agentCount} ${agentCount === 1 ? "model" : "models"}${overriddenCount > 0 ? ` - ${overriddenCount} overridden` : ""}`;
  return (
    <button
      type="button"
      aria-label={`Strategy models: ${text}`}
      aria-haspopup="dialog"
      className={styles.trigger}
      disabled={status !== "ready"}
      onClick={onOpen}
    >
      <span>{text}</span>
      <ChevronDown aria-hidden="true" className={styles.chevron} />
    </button>
  );
}
