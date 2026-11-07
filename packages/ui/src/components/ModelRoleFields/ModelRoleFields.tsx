import { useCallback } from "react";
import type { ModelRoleDefinition } from "../../hooks/useModelRoles";
import { ModelSelect } from "./ModelSelect";
import { useModelChoices } from "./useModelChoices";
import styles from "./ModelRoleFields.module.scss";

/** Roles to fill in, the models chosen so far, and how a choice is reported. */
export interface ModelRoleFieldsProps {
  /** Role names without the `@` prefix, in display order. */
  readonly roles: readonly string[];
  /** What each known role is for. */
  readonly definitions: readonly ModelRoleDefinition[];
  /** Chosen `provider/model` per role. */
  readonly values: Readonly<Record<string, string>>;
  /** Report models chosen for one or more roles. */
  readonly onChange: (changes: Readonly<Record<string, string>>) => void;
  /** Offer a single dropdown that sets every listed role. */
  readonly allowAll?: boolean;
}

/**
 * List roles with a model dropdown each, and optionally one dropdown for all of them.
 * @param {ModelRoleFieldsProps} props - Roles, chosen models, and the change callback.
 * @returns {React.ReactElement} One row per role.
 */
export function ModelRoleFields({
  roles,
  definitions,
  values,
  onChange,
  allowAll = false,
}: ModelRoleFieldsProps) {
  const models = useModelChoices();
  const handleAll = useCallback(
    (model: string) =>
      onChange(Object.fromEntries(roles.map((role) => [role, model]))),
    [onChange, roles],
  );
  return (
    <div className={styles.fields}>
      {allowAll && roles.length > 1 && (
        <ModelSelect
          label="Use one model for every role"
          value={undefined}
          models={models}
          onChange={handleAll}
          placeholder="Use one model for every role"
        />
      )}
      <ul className={styles.roles}>
        {roles.map((role) => (
          <li key={role} className={styles.role}>
            <div className={styles.name}>
              <strong>@{role}</strong>
              <span className={styles.description}>
                {definitions.find((entry) => entry.name === role)?.description}
              </span>
            </div>
            <ModelSelect
              label={`Model for @${role}`}
              value={values[role]}
              models={models}
              onChange={(model) => onChange({ [role]: model })}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}
