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
    <div className={styles.controls}>
      <StrategySelectRender
        connected={connected}
        status={status}
        strategies={strategies}
        selected={selected}
        onSelect={select}
      />
      <StrategyModels strategyPath={selected?.path} binding={binding} />
    </div>
  );
}
