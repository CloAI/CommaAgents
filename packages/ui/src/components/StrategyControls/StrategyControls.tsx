import { Mic, Paperclip } from "lucide-react";
import type { ReactNode } from "react";
import { IconButton } from "../../design-system/IconButton";
import type { SelectedStrategy } from "../../hooks/useSelectedStrategy";
import { useDaemonConnectionStatus } from "../../hooks/useCommaAgentsDaemon";
import { useStrategyModelRoles } from "../../hooks/useStrategyModelRoles";
import { StrategyModels } from "../StrategyModels";
import { StrategySelectRender } from "../StrategySelect";
import styles from "./StrategyControls.module.scss";

/** The strategy selection both controls act on. */
export interface StrategyControlsProps {
  /** Discovered strategies and the one chosen for new runs. */
  readonly strategy: SelectedStrategy;
}

/**
 * Choose the strategy for new runs and the models its roles use for them.
 * The caller owns the selection so every control agrees with the run it starts.
 * @param {StrategyControlsProps} props - Component properties.
 * @returns {React.ReactElement} The strategy picker beside its models.
 */
export function StrategyControls({
  strategy: { status, strategies, selected, select },
}: StrategyControlsProps) {
  const binding = useStrategyModelRoles(selected?.path);
  const connected = useDaemonConnectionStatus() === "connected";
  return (
    <StrategyControlsRender
      models={
        <StrategyModels strategyPath={selected?.path} binding={binding} />
      }
      selector={
        <StrategySelectRender
          connected={connected}
          status={status}
          strategies={strategies}
          selected={selected}
          onSelect={select}
        />
      }
    />
  );
}

/** Presentation slots for the strategy toolbar. */
export interface StrategyControlsRenderProps {
  /** Strategy picker shown at the start of the toolbar. */
  readonly selector: ReactNode;
  /** Model role controls beside the strategy picker. */
  readonly models?: ReactNode;
}

/**
 * Render strategy choices and placeholders for future composer actions.
 * @param {StrategyControlsRenderProps} props - Strategy and model control slots.
 * @returns {React.ReactElement} The strategy toolbar.
 */
export function StrategyControlsRender({
  selector,
  models,
}: StrategyControlsRenderProps) {
  return (
    <div className={styles.controls}>
      <div className={styles.selection}>
        {selector}
        {models}
      </div>
      <div className={styles.actions}>
        <IconButton label="Attach file (coming soon)" disabled>
          <Paperclip />
        </IconButton>
        <IconButton label="Dictation (coming soon)" disabled>
          <Mic />
        </IconButton>
      </div>
    </div>
  );
}
