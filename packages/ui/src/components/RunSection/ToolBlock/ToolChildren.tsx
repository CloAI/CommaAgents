import { ArrowUpRight, Bot } from "lucide-react";
import { childLabel, childStatus } from "../../../hooks/runs";
import type { RunChild } from "../../../hooks/runs";
import styles from "./ToolBlock.module.scss";

/** Delegated jobs and their navigation actions. */
export interface ToolChildrenProps {
  /** Jobs to show in launch order. */
  readonly childRuns: readonly RunChild[];
  /** Open a delegated job. */
  readonly onOpenChild?: (child: RunChild) => void;
}

/**
 * Show delegated jobs independently of tool arguments and output.
 * @param {ToolChildrenProps} props - Jobs and their navigation action.
 * @returns {React.ReactElement | null} Jobs, or nothing for an empty list.
 */
export function ToolChildren({ childRuns, onOpenChild }: ToolChildrenProps) {
  if (childRuns.length === 0) return null;
  return (
    <ul className={styles.children} aria-label="Delegated jobs">
      {childRuns.map((child) => (
        <li
          key={child.childRunId}
          className={styles.child}
          data-status={childStatus(child)}
        >
          <Bot size={16} aria-hidden />
          <span className={styles.name}>{childLabel(child)}</span>
          <span className={styles.status}>{childStatus(child)}</span>
          {onOpenChild && (
            <button
              type="button"
              className={styles.open}
              aria-label={`Open ${childLabel(child)}`}
              onClick={() => onOpenChild(child)}
            >
              Open
              <ArrowUpRight size={14} aria-hidden />
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}
