import { useCallback, useEffect, useState } from "react";
import { Button } from "../../../design-system/Button";
import { useCommaAgentsDaemon } from "../../../hooks/useCommaAgentsDaemon";
import { useDaemonMutation } from "../../../hooks/useDaemonMutation";
import { useModelFilters } from "../../../hooks/useModelFilters";
import { useSettings } from "../../../hooks/useSettings";
import { ModelFilters } from "../../ModelFilters";
import { SettingsPanel } from "../SettingsPanel";
import { ManagedProvider } from "./ManagedProvider";
import { AddModelDialog } from "./AddModelDialog";
import { CustomProviderDialog } from "./CustomProviderDialog";
import { ProviderConfigurationDialog } from "./ProviderConfigurationDialog";
import type { ProviderSettingsChange } from "./ProviderConfigurationDialog";
import { RemoveModelDialog } from "./RemoveModelDialog";
import type {
  DiscoveredProvider,
  ProviderModal,
  ProviderVerification,
} from "./ProvidersSettings.types";
import styles from "./ProvidersSettings.module.scss";

/** Actions available from the provider settings panel. */
export interface ProvidersSettingsProps {
  /** Dismiss the settings modal. */
  readonly onClose: () => void;
}

/**
 * Show the daemon's provider list and manage its models and credentials.
 * @param {ProvidersSettingsProps} props - Settings dismissal.
 * @returns {React.ReactElement} The providers panel and at most one provider modal.
 */
export function ProvidersSettings({ onClose }: ProvidersSettingsProps) {
  const { data, errors, clientError } = useCommaAgentsDaemon(
    { channel: "core.providers.list" },
    {},
  );
  // The list is loading until its first snapshot, not just the subscription acknowledgement.
  const isLoading = !data && !errors && !clientError;
  const { settings } = useSettings();
  const [verification, setVerification] = useState<
    Readonly<Record<string, ProviderVerification>>
  >({});
  const [activeModal, setActiveModal] = useState<ProviderModal>();
  const [modalProvider, setModalProvider] = useState<DiscoveredProvider>();
  const [modalModelId, setModalModelId] = useState<string>();
  const { mutate: refresh, isLoading: requestingRefresh } = useDaemonMutation(
    "core.providers.refresh",
  );
  const recordVerification = useCallback((change: ProviderSettingsChange) => {
    setVerification((previous) => {
      const next = { ...previous };
      if (change.verification) {
        next[change.providerId] = change.verification;
      } else {
        delete next[change.providerId];
      }
      return next;
    });
  }, []);
  const openModal = useCallback(
    (modal: ProviderModal, provider?: DiscoveredProvider, modelId?: string) => {
      setModalProvider(provider);
      setModalModelId(modelId);
      setActiveModal(modal);
    },
    [],
  );
  useEffect(() => {
    setVerification({});
    setActiveModal(undefined);
  }, [settings.daemon.url]);
  const providers = data?.data.providers ?? [];
  return (
    <SettingsPanel title="Providers" onClose={onClose}>
      <ProvidersSettingsRender
        providers={providers}
        isLoading={isLoading}
        error={errors?.message ?? clientError?.message}
        refreshing={requestingRefresh || !!data?.data.refreshing}
        onRefresh={() => void refresh({}).catch(() => {})}
        verification={verification}
        onOpen={openModal}
      />
      {activeModal === "addModel" && (
        <AddModelDialog
          onClose={() => setActiveModal(undefined)}
          providers={providers}
          initialProviderId={modalProvider?.id}
        />
      )}
      {activeModal === "customProvider" && (
        <CustomProviderDialog
          onClose={() => setActiveModal(undefined)}
          onChanged={recordVerification}
          provider={modalProvider}
        />
      )}
      {activeModal === "removeModel" && modalProvider && modalModelId && (
        <RemoveModelDialog
          onClose={() => setActiveModal(undefined)}
          provider={modalProvider}
          modelId={modalModelId}
        />
      )}
      {activeModal === "configureProvider" && modalProvider && (
        <ProviderConfigurationDialog
          onClose={() => setActiveModal(undefined)}
          onChanged={recordVerification}
          provider={modalProvider}
          onEditCustom={() => openModal("customProvider", modalProvider)}
          onRemoveModel={(modelId) =>
            openModal("removeModel", modalProvider, modelId)
          }
        />
      )}
    </SettingsPanel>
  );
}

/** The catalog, its request state, and how the panel reports what the user asks for. */
export interface ProvidersSettingsRenderProps {
  /** Known providers and their model catalog. */
  readonly providers: readonly DiscoveredProvider[];
  /** Whether the first provider list is awaiting the daemon. */
  readonly isLoading: boolean;
  /** Daemon or local request failure. */
  readonly error?: string;
  /** Whether the daemon is calling provider APIs. */
  readonly refreshing: boolean;
  /** Re-download models.dev and call every provider's API. */
  readonly onRefresh: () => void;
  /** Latest explicit credential check per provider, for this view only. */
  readonly verification: Readonly<Record<string, ProviderVerification>>;
  /** Open a provider modal, optionally about a provider and one of its models. */
  readonly onOpen: (
    modal: ProviderModal,
    provider?: DiscoveredProvider,
    modelId?: string,
  ) => void;
}

/**
 * Render the filters, result summary, and provider groups with their actions.
 * @param {ProvidersSettingsRenderProps} props - Catalog, request state, and requests.
 * @returns {React.ReactElement} The provider catalog.
 */
export function ProvidersSettingsRender({
  providers,
  isLoading,
  error,
  refreshing,
  onRefresh,
  verification,
  onOpen,
}: ProvidersSettingsRenderProps) {
  const {
    filters,
    setFilters,
    providerMatches,
    searchQuery,
    modelCount,
    isOnlyProviderEmpty,
  } = useModelFilters(providers);
  return (
    <div className={styles.providersSettings}>
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
        <div className={styles.summaryActions}>
          <Button
            className={styles.refresh}
            onClick={onRefresh}
            disabled={isLoading || !!error || refreshing}
          >
            {refreshing ? "Refreshing..." : "Refresh"}
          </Button>
          <Button
            className={styles.addProvider}
            onClick={() => onOpen("customProvider")}
            disabled={isLoading || !!error}
          >
            + Provider
          </Button>
          <Button
            className={styles.addModel}
            onClick={() =>
              onOpen(
                "addModel",
                filters.providerIds.length === 1
                  ? providers.find(({ id }) => id === filters.providerIds[0])
                  : undefined,
              )
            }
            disabled={isLoading || !!error || providers.length === 0}
          >
            + Model
          </Button>
        </div>
      </div>
      {error ? (
        <p role="alert" className={styles.message}>
          Could not load providers: {error}
        </p>
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
            <ManagedProvider
              // Filter changes remount groups so their expansion resets.
              key={`${provider.id}/${searchQuery}/${filters.capabilities.join(",")}`}
              provider={provider}
              models={models}
              searchQuery={searchQuery}
              verification={verification[provider.id]}
              onOpen={onOpen}
            />
          ))}
        </div>
      )}
    </div>
  );
}
