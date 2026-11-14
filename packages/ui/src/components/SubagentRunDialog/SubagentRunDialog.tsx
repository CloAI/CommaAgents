import { Button } from "../../design-system/Button";
import { Modal } from "../../design-system/Modal";
import { RunSection } from "../RunSection";
import { childLabel, useRunChannel } from "../../hooks/runs";
import type { RunChild, RunMessage, RunStatus } from "../../hooks/runs";
import styles from "./SubagentRunDialog.module.scss";

/** The child run to show and how to leave it. */
export interface SubagentRunDialogProps {
  /** Child run to follow. */
  readonly child: RunChild;
  /** Return to the parent subagent, when this one was opened from another. */
  readonly onBack?: () => void;
  /** Close the dialog entirely. */
  readonly onClose: () => void;
  /** Open one of this child's own subagents. */
  readonly onOpenChild: (child: RunChild) => void;
}

/**
 * Follow a subagent's run live in a dialog, with its own subagents openable in turn.
 * @param {SubagentRunDialogProps} props - Component properties.
 * @returns {React.ReactElement} The dialog.
 */
export function SubagentRunDialog({
  child,
  onBack,
  onClose,
  onOpenChild,
}: SubagentRunDialogProps) {
  const { messages, status, error, children } = useRunChannel(child.childRunId);
  return (
    <SubagentRunDialogRender
      title={`Subagent: ${childLabel(child)}`}
      messages={messages}
      status={status}
      error={error}
      childRuns={children}
      onBack={onBack}
      onClose={onClose}
      onOpenChild={onOpenChild}
    />
  );
}

/** A child run's messages and dialog actions. */
export interface SubagentRunDialogRenderProps {
  /** Title shown in the dialog header. */
  readonly title: string;
  /** The child's messages in order. */
  readonly messages: readonly RunMessage[];
  /** Where the child run stands. */
  readonly status: RunStatus;
  /** Why the child failed, once it has. */
  readonly error?: string;
  /** The child's own child runs. */
  readonly childRuns: readonly RunChild[];
  /** Return to the parent subagent, when there is one. */
  readonly onBack?: () => void;
  /** Close the dialog. */
  readonly onClose: () => void;
  /** Open one of the child's subagents. */
  readonly onOpenChild: (child: RunChild) => void;
}

/**
 * Render a child run's messages inside a modal.
 * @param {SubagentRunDialogRenderProps} props - Component properties.
 * @returns {React.ReactElement} The dialog.
 */
export function SubagentRunDialogRender({
  title,
  messages,
  status,
  error,
  childRuns,
  onBack,
  onClose,
  onOpenChild,
}: SubagentRunDialogRenderProps) {
  return (
    <Modal
      open
      title={title}
      onClose={onClose}
      className={styles.subagentRunDialog}
    >
      <div
        className={styles.content}
        role="group"
        aria-label="Subagent output"
        tabIndex={0}
      >
        {onBack && (
          <Button className={styles.back} onClick={onBack}>
            Back
          </Button>
        )}
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
            ? (error ?? "Subagent failed.")
            : status === "running"
              ? "Working..."
              : status === "completed"
                ? "Finished."
                : status === "stopped"
                  ? "Stopped."
                  : ""}
        </p>
      </div>
    </Modal>
  );
}
