import { useState } from "react";
import { Button } from "../../../../design-system/Button";
import { Modal } from "../../../../design-system/Modal";
import { useDaemonMutation } from "../../../../hooks/useDaemonMutation";
import type { DiscoveredProvider } from "../ProvidersSettings.types";
import styles from "./RemoveModelDialog.module.scss";

/** Removal affects the user entry, never the model hosted by its provider. */
export interface RemoveModelDialogProps {
  /** Owning provider. */
  readonly provider: DiscoveredProvider;
  /** Exact provider-local ID. */
  readonly modelId: string;
  /** Dismiss the workflow. */
  readonly onClose: () => void;
}

/** Confirm manual-entry removal without stacking another dialog.
 * @param {RemoveModelDialogProps} props - Entry identity and workflow actions.
 * @returns {React.ReactElement} Inline confirmation and errors.
 */
export function RemoveModelDialog({
  provider,
  modelId,
  onClose,
}: RemoveModelDialogProps) {
  const { mutate } = useDaemonMutation(
    "core.providers.removeCustomProviderModel",
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function remove() {
    if (busy) {
      return;
    }
    setBusy(true);
    setError("");
    try {
      await mutate({ providerId: provider.id, modelId });
      onClose();
    } catch (caught) {
      setError(
        caught && typeof caught === "object" && "message" in caught
          ? String(caught.message)
          : "Could not remove the model entry.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    // Saving cannot be dismissed.
    <Modal
      open
      title="Remove Custom Model"
      onClose={() => !busy && onClose()}
      className={styles.modal}
    >
      <div className={styles.content}>
        <p>
          Remove the saved custom entry for <strong>{modelId}</strong> from{" "}
          {provider.name}?
        </p>
        <p className={styles.hint}>
          If the model is also listed by the provider or catalog, it will remain
          available.
        </p>
        {error && <p role="alert">{error}</p>}
        <div className={styles.actions}>
          <Button onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={() => void remove()} disabled={busy}>
            {busy ? "Saving..." : "Remove"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
