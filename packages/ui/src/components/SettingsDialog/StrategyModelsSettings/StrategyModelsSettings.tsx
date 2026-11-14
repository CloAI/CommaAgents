import { useCallback } from "react";
import { Accordion } from "../../../design-system/Accordion";
import { useModelRoles } from "../../../hooks/useModelRoles";
import { ModelRolePresets } from "../../ModelRolePresets";
import { ModelRoleFields } from "../../ModelRoleFields";
import styles from "./StrategyModelsSettings.module.scss";

/**
 * Show each model role the daemon offers, plus any others it has configured, and save a choice immediately.
 * Strategies name roles such as `@medium` instead of models, so these choices apply to every strategy.
 * TODO: suggest models for unset roles from the connected providers instead of listing every model.
 * @returns {React.ReactElement} The strategy models section.
 */
export function StrategyModelsSettings() {
  const { modelRoles, defaults, isLoading, error, save } = useModelRoles();
  const roles = [
    ...defaults.map((entry) => entry.name),
    ...Object.keys(modelRoles).filter(
      (name) => !defaults.some((entry) => entry.name === name),
    ),
  ];
  const handleChange = useCallback(
    (changes: Readonly<Record<string, string>>) => void save(changes),
    [save],
  );
  return (
    <Accordion className={styles.section} title="Strategy model aliases">
      <p className={styles.hint}>
        Strategies ask for a tier instead of a specific model. Changes are saved
        to the daemon immediately and apply to the next run.
      </p>
      {error && (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      )}
      {isLoading ? (
        <p className={styles.hint}>Loading…</p>
      ) : (
        <>
          <ModelRolePresets
            roles={roles}
            values={modelRoles}
            onChange={handleChange}
          />
          <ModelRoleFields
            roles={roles}
            definitions={defaults}
            values={modelRoles}
            onChange={handleChange}
          />
        </>
      )}
    </Accordion>
  );
}
