import { useCallback, useState } from "react";
import { RunSection } from "../../../components/RunSection";
import { SubagentRunDialog } from "../../../components/SubagentRunDialog";
import { useRunFeed } from "../../../hooks/runs";
import type { RunChild, RunMessage, RunStatus } from "../../../hooks/runs";
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
    <RunOutputRender
      messages={messages}
      status={status}
      error={error}
      waitingForInput={pendingInputs.length > 0}
      childRuns={children}
      onOpenChild={openChild}
      selectedChild={shownChild}
      onBack={openChildren.length > 1 ? backToParentChild : undefined}
      onCloseChild={closeChild}
    />
  );
}

/** Messages and lifecycle state shown by the followed run. */
export interface RunOutputRenderProps {
  /** Conversation messages in display order. */
  readonly messages: readonly RunMessage[];
  /** Current run lifecycle. */
  readonly status: RunStatus;
  /** Detailed run failure, when available. */
  readonly error?: string;
  /** An agent is waiting for a user reply, suppressing the running notice. @default false */
  readonly waitingForInput?: boolean;
  /** Delegated jobs belonging to the displayed messages. */
  readonly childRuns: readonly RunChild[];
  /** Open a delegated job. */
  readonly onOpenChild: (child: RunChild) => void;
  /** Child run currently selected for its dialog. */
  readonly selectedChild?: RunChild;
  /** Return to the selected child's parent when nested. */
  readonly onBack?: () => void;
  /** Close the subagent dialog and return to the run. */
  readonly onCloseChild: () => void;
}

/**
 * Render a run's messages and status with scrolling that follows new content at the bottom.
 * @param {RunOutputRenderProps} props - Conversation state and child navigation.
 * @returns {React.ReactElement} Scrollable messages and the optional subagent dialog.
 */
export function RunOutputRender({
  messages,
  status,
  error,
  waitingForInput = false,
  childRuns,
  onOpenChild,
  selectedChild,
  onBack,
  onCloseChild,
}: RunOutputRenderProps) {
  const { scrollRef, contentRef, onScroll } = useStickToBottom();
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
              childRuns={childRuns}
              onOpenChild={onOpenChild}
            />
          ))}
          <p
            role={status === "failed" ? "alert" : "status"}
            className={styles.status}
            data-status={status}
          >
            {status === "failed"
              ? (error ?? "Run failed.")
              : waitingForInput
                ? ""
                : STATUS_LABELS[status]}
          </p>
        </div>
      </div>
      {selectedChild && (
        <SubagentRunDialog
          key={selectedChild.childRunId}
          child={selectedChild}
          onBack={onBack}
          onClose={onCloseChild}
          onOpenChild={onOpenChild}
        />
      )}
    </>
  );
}
