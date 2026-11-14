import styles from "./StrategySwitchDialog.module.scss";
import { Button } from "../../design-system/Button";
import { Modal } from "../../design-system/Modal";

/** Explicit alternatives when changing an executing strategy. */
export interface StrategySwitchDialogProps {
  readonly strategyName: string;
  readonly busy: boolean;
  readonly error?: string;
  readonly onStopAndSwitch: () => void;
  readonly onWait: () => void;
}

/** Offer cancellation or dismissal; waiting never queues a switch.
 * @param {StrategySwitchDialogProps} props - Pending selection and explicit actions.
 * @returns {React.ReactElement} The busy-run decision dialog.
 */
export function StrategySwitchDialog({
  strategyName,
  busy,
  error,
  onStopAndSwitch,
  onWait,
}: StrategySwitchDialogProps) {
  return (
    <Modal open title="Switch strategy?" onClose={busy ? () => {} : onWait}>
      <div className={styles.content}>
        <p>
          The current strategy is still working or waiting for a reply. Stop it
          and switch to {strategyName}?
        </p>
        <p>
          Wait keeps the current strategy. A switch starts work only after your
          next message.
        </p>
        {error && <p role="alert">{error}</p>}
        <div className={styles.actions}>
          <Button disabled={busy} onClick={onStopAndSwitch}>
            {busy ? "Switching…" : "Stop and switch"}
          </Button>
          <Button disabled={busy} onClick={onWait}>
            Wait
          </Button>
        </div>
      </div>
    </Modal>
  );
}
