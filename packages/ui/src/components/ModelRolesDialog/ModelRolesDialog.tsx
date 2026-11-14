import { useCallback, useState } from "react";
import { Button } from "../../design-system/Button";
import { Modal } from "../../design-system/Modal";
import { useModelRoles } from "../../hooks/useModelRoles";
import { ModelRoleFields } from "../ModelRoleFields";
import styles from "./ModelRolesDialog.module.scss";

/** The roles a run needs and what to do once they are saved or declined. */
export interface ModelRolesDialogProps {
  /** Role names without the `@` prefix that the strategy needs and the daemon lacks. */
  readonly roles: readonly string[];
  /** Called after the daemon saved every role, so the failed action can run again. */
  readonly onSaved: () => void;
  /** Dismiss without saving. */
  readonly onCancel: () => void;
}

/**
 * Ask for the models a strategy needs, save them on the daemon, and let the caller retry.
 * @param {ModelRolesDialogProps} props - Missing roles and completion callbacks.
 * @returns {React.ReactElement} The dialog listing each missing role.
 */
export function ModelRolesDialog({
  roles,
  onSaved,
  onCancel,
}: ModelRolesDialogProps) {
  const { defaults, save, error } = useModelRoles();
  const [chosen, setChosen] = useState<Readonly<Record<string, string>>>({});
  const handleChange = useCallback(
    (changes: Readonly<Record<string, string>>) =>
      setChosen((previous) => ({ ...previous, ...changes })),
    [],
  );
  const handleSave = useCallback(async () => {
    if (await save(chosen)) {
      onSaved();
    }
  }, [save, chosen, onSaved]);
  const complete = roles.every((role) => chosen[role] !== undefined);
  return (
    <Modal open title="Choose models to continue" onClose={onCancel}>
      <div className={styles.dialog}>
        <p>
          This strategy uses model roles that are not set yet. Choose a model
          for each; they are saved and used by every strategy.
        </p>
        <ModelRoleFields
          roles={roles}
          definitions={defaults}
          values={chosen}
          onChange={handleChange}
          allowAll
        />
        {error && (
          <p role="alert" className={styles.error}>
            {error}
          </p>
        )}
        <div className={styles.actions}>
          <Button onClick={onCancel}>Cancel</Button>
          <Button disabled={!complete} onClick={() => void handleSave()}>
            Save and continue
          </Button>
        </div>
      </div>
    </Modal>
  );
}
