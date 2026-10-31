import { useEffect, useState } from "react";
import { Button } from "../../../../design-system/Button";
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
  /** Refresh the provider browser after persistence. */
  readonly onChanged: () => Promise<void>;
  /** Block the owning Modal's close action while a command is pending. */
  readonly onBusyChange?: (busy: boolean) => void;
}

/** Confirm manual-entry removal without stacking another dialog.
 * @param {RemoveModelDialogProps} props - Entry identity and workflow actions.
 * @returns {React.ReactElement} Inline confirmation and errors.
 */
export function RemoveModelDialog({
  provider,
  modelId,
  onClose,
  onChanged,
  onBusyChange,
}: RemoveModelDialogProps) {
  const { mutate } = useDaemonMutation(
    "core.providers.removeCustomProviderModel",
  );
  const [busy, setBusy] = useState(false);
  const [removed, setRemoved] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    onBusyChange?.(busy);
    return () => onBusyChange?.(false);
  }, [busy, onBusyChange]);
  async function remove() {
    if (busy) return;
    setBusy(true);
    setError("");
    let persisted = removed;
    try {
      if (!removed) {
        await mutate({ providerId: provider.id, modelId });
        setRemoved(true);
        persisted = true;
      }
      await onChanged();
      onClose();
    } catch (error) {
      setError(
        persisted
          ? "The entry was removed, but providers could not be reloaded. Retry the reload."
          : error && typeof error === "object" && "message" in error
            ? String(error.message)
            : "Could not remove the model entry.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
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
          {busy ? "Saving..." : removed ? "Retry reload" : "Remove"}
        </Button>
      </div>
    </div>
  );
}
