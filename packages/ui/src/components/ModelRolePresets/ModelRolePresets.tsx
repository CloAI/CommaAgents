import { useState } from "react";
import { Button } from "../../design-system/Button";
import { useSettings } from "../../hooks/useSettings";
import { DEFAULT_MODEL_ROLE_PRESETS } from "./ModelRolePresets.constants";
import styles from "./ModelRolePresets.module.scss";

/** Reusable model-role configurations. */
export interface ModelRolePresetsProps {
  /** Roles offered in this editor. */
  readonly roles: readonly string[];
  /** Current effective role assignments. */
  readonly values: Readonly<Record<string, string>>;
  /** Apply a preset to this editor's scope. */
  readonly onChange: (changes: Readonly<Record<string, string>>) => void;
}

/**
 * Select built-in templates or save and delete browser-local configurations with confirmation.
 * @param {ModelRolePresetsProps} props - Available roles, current assignments, and an apply action.
 * @returns {React.ReactElement} The preset picker and confirmation controls.
 */
export function ModelRolePresets({
  roles,
  values,
  onChange,
}: ModelRolePresetsProps) {
  const { settings, saveSettings } = useSettings();
  const [selected, setSelected] = useState("");
  const [name, setName] = useState("");
  const [action, setAction] = useState<"save" | "delete">();
  const [error, setError] = useState<string>();
  const presets = {
    ...DEFAULT_MODEL_ROLE_PRESETS,
    ...settings.modelRolePresets,
  };
  const apply = (name: string) => {
    setSelected(name);
    setAction(undefined);
    const preset = presets[name];
    if (preset) {
      onChange(
        Object.fromEntries(
          Object.entries(preset).filter(([role]) => roles.includes(role)),
        ),
      );
    }
  };
  const confirm = () => {
    const saved = { ...settings.modelRolePresets };
    if (action === "delete") {
      delete saved[selected];
    } else {
      const trimmed = name.trim();
      if (!trimmed) {
        setError("Enter a configuration name.");
        return;
      }
      if (Object.hasOwn(DEFAULT_MODEL_ROLE_PRESETS, trimmed)) {
        setError("Choose a different name for your configuration.");
        return;
      }
      Object.defineProperty(saved, trimmed, {
        value: Object.fromEntries(
          roles
            .filter((role) => values[role])
            .map((role) => [role, values[role]!]),
        ),
        enumerable: true,
        configurable: true,
        writable: true,
      });
    }
    const result = saveSettings({ ...settings, modelRolePresets: saved });
    if (result.type === "error") {
      setError(result.message);
      return;
    }
    setSelected(action === "delete" ? "" : name.trim());
    setAction(undefined);
    setError(undefined);
  };
  return (
    <div className={styles.modelRolePresets}>
      <div className={styles.toolbar}>
        <select
          aria-label="Model role configuration"
          value={selected}
          onChange={(event) => apply(event.target.value)}
        >
          <option value="">Configurations…</option>
          {Object.keys(presets).map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
        <div className={styles.actions}>
          <Button
            disabled={!roles.some((role) => values[role])}
            onClick={() => {
              setName(
                Object.hasOwn(settings.modelRolePresets ?? {}, selected)
                  ? selected
                  : "",
              );
              setAction("save");
              setError(undefined);
            }}
          >
            Save configuration
          </Button>
          <Button
            disabled={!Object.hasOwn(settings.modelRolePresets ?? {}, selected)}
            onClick={() => {
              setAction("delete");
              setError(undefined);
            }}
          >
            Delete
          </Button>
        </div>
      </div>
      {action && (
        <div className={styles.confirmation}>
          {action === "save" ? (
            <label>
              Configuration name
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </label>
          ) : (
            <p>Delete “{selected}”?</p>
          )}
          {action === "save" &&
            Object.hasOwn(settings.modelRolePresets ?? {}, name.trim()) && (
              <p>This replaces the saved configuration.</p>
            )}
          <div className={styles.actions}>
            <Button onClick={() => setAction(undefined)}>Cancel</Button>
            <Button onClick={confirm}>
              {action === "save" ? "Confirm save" : "Confirm delete"}
            </Button>
          </div>
        </div>
      )}
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
