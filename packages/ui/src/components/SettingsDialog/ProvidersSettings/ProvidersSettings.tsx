import { useCallback, useEffect, useState } from "react";
import { Button } from "../../../design-system/Button";
import { Modal } from "../../../design-system/Modal";
import { SettingsPanel } from "../SettingsPanel";
import { useSettings } from "../../../hooks/useSettings";
import { useDaemonMutation } from "../../../hooks/useDaemonMutation";
import { AddModelDialog } from "./AddModelDialog";
import { ProviderConfigurationDialog } from "./ProviderConfigurationDialog";
import { CustomProviderDialog } from "./CustomProviderDialog";
import { RemoveModelDialog } from "./RemoveModelDialog";
import { useCommaAgentsDaemon } from "../../../hooks/useCommaAgentsDaemon";
import type {
  DiscoveredProvider,
  ProviderVerification,
  ProviderSettingsChange,
  ProviderDialog,
} from "./ProvidersSettings.types";
import { ModelBrowser } from "../../ModelBrowser";
import styles from "./ProvidersSettings.module.scss";

/** Actions available from the provider settings panel. */
export interface ProvidersSettingsProps {
  /** Dismiss the settings modal. */
  readonly onClose: () => void;
}

/**
 * Discover provider and model metadata from the currently configured daemon.
 * @param {ProvidersSettingsProps} props - Settings dismissal.
 * @returns {React.ReactElement} Provider browser and one active management workflow.
 */
export function ProvidersSettings({ onClose }: ProvidersSettingsProps) {
  const { data, errors, clientError, isLoading } = useCommaAgentsDaemon(
    { command: "core.providers.list" },
    { live: false },
  );
  const { settings } = useSettings();
  const [refreshed, setRefreshed] = useState<readonly DiscoveredProvider[]>();
  const [refreshProviderId, setRefreshProviderId] = useState<string>();
  const [verification, setVerification] = useState<
    Readonly<Record<string, ProviderVerification>>
  >({});
  const [dialog, setDialog] = useState<ProviderDialog | null>(null);
  const [busy, setBusy] = useState(false);
  const {
    mutate: reload,
    errors: reloadErrors,
    clientError: reloadClientError,
    isLoading: reloading,
  } = useDaemonMutation("core.providers.list");
  const {
    mutate: refresh,
    errors: refreshErrors,
    clientError: refreshClientError,
    isLoading: refreshing,
  } = useDaemonMutation("core.providers.refresh");
  const refreshModels = useCallback(
    async (providerId: string) => {
      setRefreshProviderId(providerId);
      const result = await refresh({ providerId });
      setRefreshed((previous) =>
        (previous ?? data?.providers ?? []).map((provider) =>
          provider.id === result.id ? result : provider,
        ),
      );
    },
    [refresh, data],
  );
  useEffect(() => {
    setRefreshed(undefined);
  }, [data]);
  useEffect(() => {
    setRefreshed(undefined);
    setVerification({});
    setRefreshProviderId(undefined);
    setDialog(null);
    setBusy(false);
  }, [settings.daemon.url]);
  const providers = refreshed ?? data?.providers ?? [];
  const changed = useCallback(
    async (change?: ProviderSettingsChange) => {
      if (change)
        setVerification((previous) => {
          const next = { ...previous };
          if (change.verification)
            next[change.providerId] = change.verification;
          else delete next[change.providerId];
          return next;
        });
      const result = await reload({ live: false });
      setRefreshed(result.providers);
    },
    [reload],
  );
  const close = useCallback(() => {
    if (!busy) setDialog(null);
  }, [busy]);
  const dismiss = useCallback(() => {
    setDialog(null);
    setBusy(false);
  }, []);
  const title = !dialog
    ? ""
    : dialog.type === "model"
      ? "Add Model"
      : dialog.type === "custom"
        ? dialog.provider
          ? "Configure Custom Provider"
          : "Add Custom Provider"
        : dialog.type === "removeModel"
          ? "Remove Custom Model"
          : `${dialog.provider.authStatus === "configured" || dialog.provider.credentialType === "none" ? "Configure" : "Connect"} ${dialog.provider.name}`;
  return (
    <>
      <ProvidersSettingsRender
        onClose={onClose}
        providers={providers}
        isLoading={isLoading}
        error={
          refreshed
            ? undefined
            : (reloadErrors?.message ??
              reloadClientError?.message ??
              errors?.message ??
              clientError?.message)
        }
        onReload={() => {
          void changed().catch(() => {});
        }}
        reloading={reloading}
        onRefresh={(providerId) => {
          void refreshModels(providerId).catch(() => {});
        }}
        refreshing={refreshing}
        refreshProviderId={refreshProviderId}
        refreshError={refreshErrors?.message ?? refreshClientError?.message}
        verification={verification}
        onAddProvider={() => setDialog({ type: "custom" })}
        onAddModel={(providerId) => setDialog({ type: "model", providerId })}
        onConfigure={(provider) =>
          setDialog({ type: "configuration", provider })
        }
        onRemoveModel={(provider, modelId) =>
          setDialog({ type: "removeModel", provider, modelId })
        }
      />
      {dialog && (
        <Modal
          open
          title={title}
          onClose={close}
          className={styles.workflowModal}
        >
          {dialog.type === "model" ? (
            <AddModelDialog
              providers={providers}
              initialProviderId={dialog.providerId}
              onClose={dismiss}
              onChanged={changed}
              onBusyChange={setBusy}
            />
          ) : dialog.type === "custom" ? (
            <CustomProviderDialog
              provider={dialog.provider}
              onClose={dismiss}
              onChanged={changed}
              onBusyChange={setBusy}
            />
          ) : dialog.type === "removeModel" ? (
            <RemoveModelDialog
              provider={dialog.provider}
              modelId={dialog.modelId}
              onClose={dismiss}
              onChanged={changed}
              onBusyChange={setBusy}
            />
          ) : (
            <ProviderConfigurationDialog
              provider={dialog.provider}
              onClose={dismiss}
              onChanged={changed}
              onBusyChange={setBusy}
              onEditCustom={() =>
                setDialog({ type: "custom", provider: dialog.provider })
              }
              onRemoveModel={(modelId) =>
                setDialog({
                  type: "removeModel",
                  provider: dialog.provider,
                  modelId,
                })
              }
            />
          )}
        </Modal>
      )}
    </>
  );
}

/** Provider discovery data and request feedback for the settings browser. */
export interface ProvidersSettingsRenderProps extends ProvidersSettingsProps {
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
  /** Open the single provider workflow. */
  readonly onAddProvider?: () => void;
  /** Open the model form, optionally preselecting a provider. */
  readonly onAddModel?: (providerId?: string) => void;
  /** Open credential configuration for a provider. */
  readonly onConfigure?: (provider: DiscoveredProvider) => void;
  /** Remove only a manual entry. */
  readonly onRemoveModel?: (
    provider: DiscoveredProvider,
    modelId: string,
  ) => void;
}

/**
 * Manage providers and browse their models.
 * @param {ProvidersSettingsRenderProps} props - Provider metadata and loading feedback.
 * @returns {React.ReactElement} The providers panel with the shared model browser.
 */
export function ProvidersSettingsRender({
  onClose,
  onAddProvider,
  isLoading,
  error,
  ...browserProps
}: ProvidersSettingsRenderProps) {
  return (
    <SettingsPanel
      title="Providers"
      onClose={onClose}
      headerActions={
        <Button
          className={styles.addButton}
          onClick={onAddProvider}
          disabled={isLoading || !!error}
        >
          + Provider
        </Button>
      }
    >
      <ModelBrowser isLoading={isLoading} error={error} {...browserProps} />
    </SettingsPanel>
  );
}
