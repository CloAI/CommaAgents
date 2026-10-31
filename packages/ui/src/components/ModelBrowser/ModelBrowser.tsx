import { useState } from "react";
import { Button } from "../../design-system/Button";
import { Input } from "../../design-system/Input";
import { MODEL_CAPABILITIES } from "./ModelBrowser.constants";
import type {
  DiscoveredModel,
  DiscoveredProvider,
  ModelCapability,
  ProviderVerification,
} from "./ModelBrowser.types";
import { ProviderFilter } from "./ProviderFilter";
import { ProviderModels } from "./ProviderModels";
import styles from "./ModelBrowser.module.scss";

/** Provider discovery data, request feedback, and either management or selection behavior. */
export interface ModelBrowserProps {
  /** Known providers and their model catalog. */
  readonly providers: readonly DiscoveredProvider[];
  /** Whether discovery is awaiting the daemon. */
  readonly isLoading: boolean;
  /** Daemon or local request failure. */
  readonly error?: string;
  /** Retry a failed initial catalog request without resetting filters. */
  readonly onReload?: () => void;
  /** Whether the explicit retry is pending. */
  readonly reloading?: boolean;
  /** Refresh catalog metadata and fetch the selected provider's models. */
  readonly onRefresh?: (providerId: string) => void;
  /** Provider owning the current refresh request or feedback. */
  readonly refreshProviderId?: string;
  /** Whether the catalog and live model refresh is pending. */
  readonly refreshing?: boolean;
  /** Refresh failure shown alongside the existing model list. */
  readonly refreshError?: string;
  /** Latest check displayed only in the current settings view. */
  readonly verification?: Readonly<Record<string, ProviderVerification>>;
  /** Open the model form, optionally preselecting a provider. */
  readonly onAddModel?: (providerId?: string) => void;
  /** Open credential configuration for a provider. */
  readonly onConfigure?: (provider: DiscoveredProvider) => void;
  /** Remove only a manual entry. */
  readonly onRemoveModel?: (
    provider: DiscoveredProvider,
    modelId: string,
  ) => void;
  /**
   * Choose a model instead of managing providers. Selecting hides the add, refresh,
   * configure, and remove actions.
   */
  readonly onPick?: (
    provider: DiscoveredProvider,
    model: DiscoveredModel,
  ) => void;
  /** Model marked as the current choice while picking. */
  readonly selected?: {
    readonly providerId: string;
    readonly modelId: string;
  };
  /** Reason a model cannot be picked, or undefined when it can. */
  readonly isDisabled?: (
    provider: DiscoveredProvider,
    model: DiscoveredModel,
  ) => string | undefined;
}

/**
 * Browse models with combined text, provider, and capability filters.
 * @param {ModelBrowserProps} props - Provider metadata, loading feedback, and mode callbacks.
 * @returns {React.ReactElement} Compact filters and collapsible provider groups.
 */
export function ModelBrowser({
  providers,
  isLoading,
  error,
  onReload,
  reloading = false,
  onRefresh,
  refreshProviderId,
  refreshing = false,
  refreshError,
  verification = {},
  onAddModel,
  onConfigure,
  onRemoveModel,
  onPick,
  selected,
  isDisabled,
}: ModelBrowserProps) {
  const [search, setSearch] = useState("");
  const [providerIds, setProviderIds] = useState<readonly string[]>([]);
  const [capabilities, setCapabilities] = useState<readonly ModelCapability[]>(
    [],
  );
  const query = search.trim().toLowerCase();
  const picking = onPick !== undefined;
  const filtering =
    query !== "" || providerIds.length > 0 || capabilities.length > 0;

  const matchingProviders = providers.flatMap((provider) => {
    if (providerIds.length > 0 && !providerIds.includes(provider.id)) return [];
    const providerMatches = `${provider.id} ${provider.name}`
      .toLowerCase()
      .includes(query);
    const matchingModels = provider.models.filter(
      (model) =>
        (providerMatches ||
          `${model.id} ${model.metadata.name ?? ""} ${model.metadata.family ?? ""}`
            .toLowerCase()
            .includes(query)) &&
        capabilities.every(
          (capability) => model.metadata.capabilities?.[capability] === true,
        ),
    );
    return matchingModels.length > 0 ||
      (provider.models.length === 0 &&
        capabilities.length === 0 &&
        providerMatches)
      ? [{ provider, models: matchingModels }]
      : [];
  });
  const modelCount = matchingProviders.reduce(
    (total, entry) => total + entry.models.length,
    0,
  );

  return (
    <div className={styles.panel}>
      <ProviderFilter
        providers={providers}
        value={providerIds}
        onChange={(ids) => {
          setProviderIds(ids);
        }}
      />
      <fieldset className={styles.capabilities}>
        <legend>Model capabilities</legend>
        <div className={styles.toggles}>
          {MODEL_CAPABILITIES.map((capability) => (
            <Button
              key={capability.id}
              className={styles.toggle}
              aria-pressed={capabilities.includes(capability.id)}
              onClick={() => {
                setCapabilities((previous) =>
                  previous.includes(capability.id)
                    ? previous.filter((id) => id !== capability.id)
                    : [...previous, capability.id],
                );
              }}
            >
              <capability.icon
                aria-hidden="true"
                className={styles.capabilityIcon}
              />
              {capability.label}
            </Button>
          ))}
        </div>
      </fieldset>
      <div className={styles.modelsHeader}>
        <p className={styles.summary} role="status">
          {isLoading || error
            ? "Models"
            : `${modelCount} ${modelCount === 1 ? "model" : "models"} found`}
        </p>
        {!picking && (
          <Button
            className={styles.toggle}
            onClick={() =>
              onAddModel?.(
                providerIds.length === 1 ? providerIds[0] : undefined,
              )
            }
            disabled={isLoading || !!error || providers.length === 0}
          >
            Add model
          </Button>
        )}
      </div>
      <Input
        type="search"
        aria-label="Search providers and models"
        placeholder="Search providers and models"
        value={search}
        onChange={(event) => {
          setSearch(event.target.value);
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.preventDefault();
        }}
      />
      {error ? (
        <div className={styles.message}>
          <p role="alert">Could not load providers: {error}</p>
          {onReload && (
            <Button disabled={reloading} onClick={onReload}>
              {reloading ? "Reloading..." : "Retry"}
            </Button>
          )}
        </div>
      ) : isLoading ? (
        <p role="status" className={styles.message}>
          Loading providers...
        </p>
      ) : providers.length === 0 ? (
        <p role="status" className={styles.message}>
          No providers are available.
        </p>
      ) : matchingProviders.length === 0 ? (
        <p className={styles.message}>
          {providerIds.length === 1 &&
          providers.find((provider) => provider.id === providerIds[0])?.models
            .length === 0
            ? "This provider has no models in the catalog."
            : "No models match your filters."}
        </p>
      ) : (
        <div className={styles.groups} role="group" aria-label="Models">
          {matchingProviders.map(({ provider, models: matchingModels }) => {
            const hasSelection = selected?.providerId === provider.id;
            return (
              <ProviderModels
                key={`${provider.id}/${query}/${capabilities.join(",")}`}
                provider={provider}
                models={matchingModels}
                query={query}
                verification={verification[provider.id]}
                onConfigure={onConfigure}
                onRefresh={picking ? undefined : onRefresh}
                refreshing={refreshing && refreshProviderId === provider.id}
                refreshDisabled={refreshing || reloading || isLoading}
                refreshError={
                  refreshProviderId === provider.id ? refreshError : undefined
                }
                onRemoveModel={picking ? undefined : onRemoveModel}
                onPick={onPick}
                selectedModelId={hasSelection ? selected.modelId : undefined}
                isDisabled={isDisabled}
                // Picking is a quick lookup, so reveal matches and the current choice.
                defaultExpanded={picking && (filtering || hasSelection)}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
