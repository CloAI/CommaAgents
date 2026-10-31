import type { SelectedStrategy } from "../../hooks/useSelectedStrategy";
import { StrategyModels } from "../StrategyModels";
import { StrategySelectRender } from "../StrategySelect";
import styles from "./StrategyControls.module.scss";

/** The strategy selection both controls act on. */
export interface StrategyControlsProps {
  /** Discovered strategies and the one chosen for new runs. */
  readonly strategy: SelectedStrategy;
}

/**
 * Choose the strategy for new runs and edit the models it uses.
 * The caller owns the selection so every control agrees with the run it starts.
 * @param {StrategyControlsProps} props - Component properties.
 * @returns {React.ReactElement} The strategy picker beside its models summary.
 */
export function StrategyControls({
  strategy: { status, strategies, selected, select },
}: StrategyControlsProps) {
  return (
    <div className={styles.controls}>
      <StrategySelectRender
        status={status}
        strategies={strategies}
        selected={selected}
        onSelect={select}
      />
      <StrategyModels strategyPath={selected?.path} />
    </div>
  );
}
