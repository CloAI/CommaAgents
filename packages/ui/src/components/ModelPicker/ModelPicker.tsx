import { useModelFilters } from "../../hooks/useModelFilters";
import { ModelFilters } from "../ModelFilters";
import { ProviderModels } from "../ProviderModels";
import type {
  DiscoveredModel,
  DiscoveredProvider,
  PickedModel,
} from "./ModelPicker.types";
import { PickableModel } from "./PickableModel";
import styles from "./ModelPicker.module.scss";

/** The catalog, its request state, and how a choice is made from it. */
export interface ModelPickerProps {
  /** Known providers and their model catalog. */
  readonly providers: readonly DiscoveredProvider[];
  /** Whether discovery is awaiting the daemon. */
  readonly isLoading: boolean;
  /** Daemon or local request failure. */
  readonly error?: string;
  /** Choose a model. */
  readonly onPick: (
    provider: DiscoveredProvider,
    model: DiscoveredModel,
  ) => void;
  /** Model marked as the current choice. */
  readonly selected?: PickedModel;
  /** Reason a model cannot be picked, or undefined when it can. */
  readonly isDisabled?: (
    provider: DiscoveredProvider,
    model: DiscoveredModel,
  ) => string | undefined;
}

/**
 * Browse the catalog to choose one model.
 * @param {ModelPickerProps} props - Catalog, request state, and the choice.
 * @returns {React.ReactElement} Filters and pickable models.
 */
export function ModelPicker({
  providers,
  isLoading,
  error,
  onPick,
  selected,
  isDisabled,
}: ModelPickerProps) {
  const {
    filters,
    setFilters,
    providerMatches,
    searchQuery,
    isFiltering,
    modelCount,
    isOnlyProviderEmpty,
  } = useModelFilters(providers);
  return (
    <div className={styles.modelPicker}>
      <ModelFilters
        providers={providers}
        value={filters}
        onChange={setFilters}
      />
      <div className={styles.summary}>
        <p role="status">
          {isLoading || error
            ? "Models"
            : `${modelCount} ${modelCount === 1 ? "model" : "models"} found`}
        </p>
      </div>
      {error ? (
        <div className={styles.message}>
          <p role="alert">Could not load providers: {error}</p>
        </div>
      ) : isLoading ? (
        <p role="status" className={styles.message}>
          Loading providers...
        </p>
      ) : providers.length === 0 ? (
        <p role="status" className={styles.message}>
          No providers are available.
        </p>
      ) : providerMatches.length === 0 ? (
        <p className={styles.message}>
          {isOnlyProviderEmpty
            ? "This provider has no models in the catalog."
            : "No models match your filters."}
        </p>
      ) : (
        <div className={styles.groups} role="group" aria-label="Models">
          {providerMatches.map(({ provider, models }) => (
            <ProviderModels
              // Filter changes remount groups so their expansion resets.
              key={`${provider.id}/${searchQuery}/${filters.capabilities.join(",")}`}
              provider={provider}
              models={models}
              searchQuery={searchQuery}
              // Picking is a quick lookup, so reveal matches and the current choice.
              defaultExpanded={
                isFiltering || selected?.providerId === provider.id
              }
              renderModel={(model) => (
                <PickableModel
                  provider={provider}
                  model={model}
                  searchQuery={searchQuery}
                  onPick={onPick}
                  isSelected={
                    selected?.providerId === provider.id &&
                    selected.modelId === model.id
                  }
                  disabledReason={isDisabled?.(provider, model)}
                />
              )}
            />
          ))}
        </div>
      )}
    </div>
  );
}
