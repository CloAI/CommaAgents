import { useEffect, useMemo, useState } from "react";
import { Select } from "../../design-system/Select";
import type { SelectOption } from "../../design-system/Select";
import { useDaemonConnectionStatus } from "../../hooks/useCommaAgentsDaemon";
import { useSelectedStrategy } from "../../hooks/useSelectedStrategy";
import type { SelectedStrategy } from "../../hooks/useSelectedStrategy";
import type { StrategyItem } from "../../hooks/useStrategies";
import {
  GROUP_ORDER,
  ORIGIN_GROUPS,
  ORIGIN_TAGS,
  STATUS_PLACEHOLDERS,
} from "./StrategySelect.constants";
import styles from "./StrategySelect.module.scss";

/**
 * Show the strategy chosen for new runs and let the user change it.
 * @returns {React.ReactElement} The rendered component.
 */
export function StrategySelect() {
  const connected = useDaemonConnectionStatus() === "connected";
  const { status, strategies, selected, select } = useSelectedStrategy();
  return (
    <StrategySelectRender
      connected={connected}
      status={status}
      strategies={strategies}
      selected={selected}
      onSelect={select}
    />
  );
}

/** Strategy list state and the selection handler. */
export interface StrategySelectRenderProps extends Pick<
  SelectedStrategy,
  "status" | "strategies" | "selected"
> {
  /** Whether the daemon is connected. Waiting is shown after 50ms. @default true */
  readonly connected?: boolean;
  /** Receive the path of the chosen strategy. */
  readonly onSelect: (path: string) => void;
}

/**
 * Map discovered strategies onto selectable options.
 * @param {StrategySelectRenderProps} props - Component properties.
 * @returns {React.ReactElement} The rendered component.
 */
export function StrategySelectRender({
  connected = true,
  status,
  strategies,
  selected,
  onSelect,
}: StrategySelectRenderProps) {
  const options = useMemo(() => strategies.map(toOption), [strategies]);
  const [showWaiting, setShowWaiting] = useState(false);
  useEffect(() => {
    setShowWaiting(false);
    if (connected) {
      return;
    }
    const timer = window.setTimeout(() => setShowWaiting(true), 50);
    return () => window.clearTimeout(timer);
  }, [connected]);
  if (!connected) {
    return (
      <span
        className={styles.waiting}
        role="status"
        aria-label="Daemon connection"
        aria-busy={!showWaiting}
      >
        {showWaiting ? "Waiting for daemon…" : ""}
      </span>
    );
  }
  return (
    <Select
      label="Strategy"
      options={options}
      value={selected?.path}
      onChange={onSelect}
      placeholder={STATUS_PLACEHOLDERS[status]}
      disabled={status !== "ready"}
      searchable
      searchPlaceholder="Search strategies..."
      groupOrder={GROUP_ORDER}
      emptyMessage="No strategies match"
    />
  );
}

/**
 * Describe one strategy as a select option.
 * @param {StrategyItem} strategy - Discovered strategy.
 * @returns {SelectOption} Option keyed by the strategy path.
 */
function toOption(strategy: StrategyItem): SelectOption {
  const group = ORIGIN_GROUPS[strategy.origin];
  return {
    value: strategy.path,
    label: strategy.label,
    description: strategy.description,
    tag: ORIGIN_TAGS[strategy.origin],
    group,
    // The bare name is searchable even when the label is "<project> > <name>"; the group word finds user strategies by "project".
    keywords: `${strategy.name} ${group ?? ""}`,
  };
}
