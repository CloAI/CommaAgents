import { useId, useState } from "react";
import { ChevronRight, Wrench } from "lucide-react";
import { childStatus } from "../../../../hooks/runs";
import type { RunChild } from "../../../../hooks/runs";
import type { RunTool } from "../../RunSection.types";
import { ToolBlock, ToolChildren } from "../ToolBlock";
import styles from "./ToolGroup.module.scss";

/** Consecutive calls and the jobs they launched. */
export interface ToolGroupProps {
  /** Original tools in chronological order. */
  readonly tools: readonly RunTool[];
  /** Jobs belonging to these calls in this message. */
  readonly childRuns?: readonly RunChild[];
  /** Open a delegated job. */
  readonly onOpenChild?: (child: RunChild) => void;
}

/**
 * Collapse consecutive tools while keeping running and failed jobs visible.
 * @param {ToolGroupProps} props - Original calls, associated jobs, and navigation.
 * @returns {React.ReactElement} Expandable calls and visible delegated jobs.
 */
export function ToolGroup({
  tools,
  childRuns = [],
  onOpenChild,
}: ToolGroupProps) {
  const [expanded, setExpanded] = useState(false);
  const contentId = useId();
  const grouped = tools.length > 1;
  const visibleJobs = childRuns.filter((child) =>
    ["running", "failed"].includes(childStatus(child)),
  );
  return (
    <div className={styles.toolGroup}>
      {grouped && (
        <button
          type="button"
          className={styles.summary}
          aria-expanded={expanded}
          aria-controls={contentId}
          onClick={() => setExpanded((value) => !value)}
        >
          <ChevronRight size={16} className={styles.chevron} aria-hidden />
          <Wrench size={16} aria-hidden />
          <span>{tools.length} tools</span>
          {(["running", "completed", "failed", "stopped"] as const).map(
            (status) => {
              const count = tools.filter(
                (tool) => tool.status === status,
              ).length;
              return (
                count > 0 && (
                  <span key={status} data-status={status}>
                    · {count} {status}
                  </span>
                )
              );
            },
          )}
          {visibleJobs.length > 0 && (
            <span>
              · {visibleJobs.length} delegated{" "}
              {visibleJobs.length === 1 ? "job" : "jobs"}
            </span>
          )}
        </button>
      )}
      <div
        id={contentId}
        className={styles.content}
        hidden={grouped && !expanded}
      >
        {tools.map((tool) => (
          <ToolBlock
            key={tool.toolCallId}
            tool={tool}
            childRuns={childRuns.filter(
              (child) =>
                child.toolCallId === tool.toolCallId &&
                !visibleJobs.includes(child),
            )}
            onOpenChild={onOpenChild}
          />
        ))}
      </div>
      <ToolChildren childRuns={visibleJobs} onOpenChild={onOpenChild} />
    </div>
  );
}
