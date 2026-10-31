import { useCallback, useState } from "react";
import { RunSection } from "../../../components/RunSection";
import { SubagentRunDialog } from "../../../components/SubagentRunDialog";
import { useRunFeed } from "../../../hooks/runs";
import type { RunChild } from "../../../hooks/runs";
import { useStickToBottom } from "../../../hooks/useStickToBottom";
import { STATUS_LABELS } from "../RunPage.constants";
import styles from "../RunPage.module.scss";

/**
 * Show the run's messages and status, and its subagents in a dialog on request.
 * @returns {React.ReactElement} The scrolling run output.
 */
export function RunOutput() {
  // Opening a subagent from inside another pushes it, so Back returns to the parent subagent.
  const [openChildren, setOpenChildren] = useState<readonly RunChild[]>([]);
  const { messages, status, error, pendingInputs, children } = useRunFeed();
  const { scrollRef, contentRef, onScroll } = useStickToBottom();
  const openChild = useCallback(
    (child: RunChild) => setOpenChildren((stack) => [...stack, child]),
    [],
  );
  const closeChild = useCallback(() => setOpenChildren([]), []);
  const backToParentChild = useCallback(
    () => setOpenChildren((stack) => stack.slice(0, -1)),
    [],
  );
  const shownChild = openChildren.at(-1);
  return (
    <>
      <div
        ref={scrollRef}
        className={styles.sections}
        role="group"
        aria-label="Run output"
        tabIndex={0}
        onScroll={onScroll}
      >
        <div ref={contentRef} className={styles.content}>
          {messages.map((message) => (
            <RunSection
              key={message.id}
              message={message}
              childRuns={children}
              onOpenChild={openChild}
            />
          ))}
          <p
            role={status === "failed" ? "alert" : "status"}
            className={styles.status}
            data-status={status}
          >
            {status === "failed"
              ? (error ?? "Run failed.")
              : pendingInputs.length > 0
                ? ""
                : STATUS_LABELS[status]}
          </p>
        </div>
      </div>
      {shownChild && (
        <SubagentRunDialog
          key={shownChild.childRunId}
          child={shownChild}
          onBack={openChildren.length > 1 ? backToParentChild : undefined}
          onClose={closeChild}
          onOpenChild={openChild}
        />
      )}
    </>
  );
}
