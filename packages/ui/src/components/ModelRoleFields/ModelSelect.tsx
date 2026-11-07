import { Select } from "../../design-system/Select";
import { MODEL_CAPABILITIES } from "../ModelDetails/ModelDetails.constants";
import type { ModelChoices } from "./useModelChoices";
import styles from "./ModelRoleFields.module.scss";

/** The models to choose from and the current choice. */
export interface ModelSelectProps {
  /** Accessible name of the dropdown. */
  readonly label: string;
  /** Current `provider/model`, if one is set. */
  readonly value: string | undefined;
  /** Models of connected providers. */
  readonly models: ModelChoices;
  /** Receive the chosen `provider/model`. */
  readonly onChange: (model: string) => void;
  /** Shown while nothing is chosen. @default "Choose a model" */
  readonly placeholder?: string;
}

/**
 * Choose one model of a connected provider from a searchable dropdown.
 * @param {ModelSelectProps} props - Choices, current value, and the change callback.
 * @returns {React.ReactElement} The dropdown.
 */
export function ModelSelect({
  label,
  value,
  models,
  onChange,
  placeholder = "Choose a model",
}: ModelSelectProps) {
  return (
    <div className={styles.modelSelect}>
      <Select
        label={label}
        options={models.choices.map((choice) => ({
          value: choice.value,
          label: choice.label,
          description: choice.value,
          group: choice.group,
          suffix: (
            <span className={styles.capabilities}>
              {MODEL_CAPABILITIES.filter(
                (capability) => choice.capabilities?.[capability.id] === true,
              ).map((capability) => (
                <span
                  key={capability.id}
                  role="img"
                  aria-label={capability.label}
                  title={capability.label}
                >
                  <capability.icon aria-hidden="true" />
                </span>
              ))}
            </span>
          ),
        }))}
        value={value}
        onChange={onChange}
        placeholder={
          models.status === "error"
            ? "Models unavailable"
            : models.status === "empty"
              ? "No connected providers - connect one in Settings > Providers"
              : (value ?? placeholder)
        }
        disabled={models.status !== "ready"}
        triggerLabel={value ?? placeholder}
        searchable
        searchPlaceholder="Search models..."
        groupOrder={models.groups}
        emptyMessage="No models match"
      />
    </div>
  );
}
