import styles from "./ContextOverflowDialog.module.scss";
import { Button } from "../../design-system/Button";
import { Modal } from "../../design-system/Modal";

/** Context alternatives before a continuation is accepted. */
export interface ContextOverflowDialogProps {
  readonly estimatedTokens: number;
  readonly tokenLimit?: number;
  readonly recentCount: number;
  readonly error?: string;
  readonly onChoose: (choice: "compact" | "recent" | "full") => void;
  readonly onCancel: () => void;
}

/** Let the user decide how much prior context to send without changing visible history.
 * @param {ContextOverflowDialogProps} props - Estimated budget and context-choice actions.
 * @returns {React.ReactElement} The context decision dialog.
 */
export function ContextOverflowDialog({
  estimatedTokens,
  tokenLimit,
  recentCount,
  error,
  onChoose,
  onCancel,
}: ContextOverflowDialogProps) {
  return (
    <Modal open title="Choose conversation context" onClose={onCancel}>
      <div className={styles.content}>
        {error ? (
          <p role="alert">{error}</p>
        ) : (
          <p>This request may exceed the model's context limit.</p>
        )}
        <p>
          Estimated request: {estimatedTokens.toLocaleString()} tokens
          {tokenLimit ? `; budget: ${tokenLimit.toLocaleString()}` : ""}.
          Estimates may differ from the provider's count.
        </p>
        <p>
          Compacting uses a model call to summarize older discussion. Your
          visible chat history stays available.
        </p>
        <div className={styles.actions}>
          <Button onClick={() => onChoose("compact")}>Compact</Button>
          <Button onClick={() => onChoose("recent")}>
            Send {recentCount} recent messages
          </Button>
          <Button onClick={() => onChoose("full")}>
            Continue with full history
          </Button>
          <Button onClick={onCancel}>Cancel</Button>
        </div>
      </div>
    </Modal>
  );
}
