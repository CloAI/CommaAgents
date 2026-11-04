import { ModelDetails } from "../../ModelDetails";
import type { DiscoveredModel, DiscoveredProvider } from "../ModelPicker.types";
import styles from "./PickableModel.module.scss";

/** One model and whether it is, or can be, the choice. */
export interface PickableModelProps {
  /** Provider owning the model. */
  readonly provider: DiscoveredProvider;
  /** Model to show. */
  readonly model: DiscoveredModel;
  /** Normalized search text to highlight. */
  readonly searchQuery: string;
  /** Choose this model. */
  readonly onPick: (
    provider: DiscoveredProvider,
    model: DiscoveredModel,
  ) => void;
  /** Whether this model is the current choice. */
  readonly isSelected: boolean;
  /** Why this model cannot be picked, or undefined when it can. */
  readonly disabledReason?: string;
}

/**
 * Show a model as a button that picks it, noting the current choice or why it is unavailable.
 * @param {PickableModelProps} props - Model, search, and its choice state.
 * @returns {React.ReactElement} The pick button and its notes.
 */
export function PickableModel({
  provider,
  model,
  searchQuery,
  onPick,
  isSelected,
  disabledReason,
}: PickableModelProps) {
  return (
    <>
      <button
        type="button"
        className={styles.pick}
        aria-current={isSelected ? "true" : undefined}
        disabled={disabledReason !== undefined}
        onClick={() => onPick(provider, model)}
      >
        <ModelDetails
          provider={provider}
          model={model}
          highlightSearchQuery={searchQuery}
        />
      </button>
      {isSelected && <span className={styles.note}>Selected</span>}
      {disabledReason && <span className={styles.note}>{disabledReason}</span>}
    </>
  );
}
