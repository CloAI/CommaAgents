import { useCallback, useEffect, useId, useRef, useState } from "react";
import type { FormEventHandler } from "react";
import { Button } from "../../../../design-system/Button";
import { TextArea } from "../../../../design-system/TextArea";
import { normalizeModelId } from "../AddModelDialog/AddModelDialog.utils";
import { Input } from "../../../../design-system/Input";
import { useCommaAgentsDaemon } from "../../../../hooks/useCommaAgentsDaemon";
import { useDaemonMutation } from "../../../../hooks/useDaemonMutation";
import type { DiscoveredProvider } from "../ProvidersSettings.types";
import type {
  ProviderConfiguration,
  ProviderSettingsChange,
} from "../ProviderConfigurationDialog";
import { providerErrorMessage } from "../ProviderConfigurationDialog/ProviderConfigurationDialog.utils";
import styles from "../ProviderConfigurationDialog/ProviderConfigurationDialog.module.scss";

/** Custom compatible endpoint workflow owned by the provider settings domain. */
export interface CustomProviderDialogProps {
  /** Existing user-owned provider, omitted when creating one. */
  readonly provider?: DiscoveredProvider;
  /** Close the workflow, keeping changes already saved to core. */
  readonly onClose: () => void;
  /** Reload providers without performing another mutation. */
  readonly onChanged: (change?: ProviderSettingsChange) => Promise<void>;
  /** Block parent dismissal while a submitted command is pending. */
  readonly onBusyChange?: (busy: boolean) => void;
}

/**
 * Create or edit an owned compatible endpoint without stacking dialogs.
 * @param {CustomProviderDialogProps} props - Optional provider and workflow callbacks.
 * @returns {React.ReactElement} Loading feedback or the endpoint form.
 */
export function CustomProviderDialog({
  provider,
  ...props
}: CustomProviderDialogProps) {
  return provider ? (
    <ExistingCustomProviderDialog provider={provider} {...props} />
  ) : (
    <CustomProviderForm {...props} />
  );
}

/** Load editable endpoint fields without ever reading its stored key.
 * @param {CustomProviderDialogProps} props - Provider and workflow callbacks.
 * @returns {React.ReactElement} Loading feedback or editable form.
 */
function ExistingCustomProviderDialog({
  provider,
  ...props
}: CustomProviderDialogProps & { readonly provider: DiscoveredProvider }) {
  const { data, errors, clientError, isLoading } = useCommaAgentsDaemon(
    { command: "core.providers.getConfiguration" },
    { providerId: provider.id },
  );
  if (!data || !data.customProvider)
    return (
      <div className={styles.form}>
        <p role={isLoading ? "status" : "alert"} className={styles.notice}>
          {isLoading
            ? "Loading provider..."
            : (errors?.message ??
              clientError?.message ??
              "This provider is not owned by user settings.")}
        </p>
        <div className={styles.actions}>
          <Button onClick={props.onClose}>Close</Button>
        </div>
      </div>
    );
  return <CustomProviderForm {...props} provider={provider} initial={data} />;
}

/** Persist an endpoint, optional key, and model IDs using ordinary commands.
 * @param {CustomProviderDialogProps} props - Initial endpoint and workflow callbacks.
 * @returns {React.ReactElement} Stateful endpoint workflow.
 */
function CustomProviderForm({
  provider,
  initial,
  onClose,
  onChanged,
  onBusyChange = () => {},
}: CustomProviderDialogProps & { readonly initial?: ProviderConfiguration }) {
  const { mutate: add } = useDaemonMutation("core.providers.addCustomProvider");
  const { mutate: update } = useDaemonMutation(
    "core.providers.updateCustomProvider",
  );
  const { mutate: configure } = useDaemonMutation("core.providers.configure");
  const { mutate: addModel } = useDaemonMutation(
    "core.providers.addCustomProviderModel",
  );
  const { mutate: remove } = useDaemonMutation(
    "core.providers.removeCustomProvider",
  );
  const [id, setId] = useState(provider?.id ?? "");
  const [name, setName] = useState(initial?.customProvider?.name ?? "");
  const [baseURL, setBaseURL] = useState(
    initial?.customProvider?.baseURL ?? "",
  );
  const [credentialType, setCredentialType] = useState<"api" | "none">(
    initial?.customProvider?.credentialType ?? "api",
  );
  const [apiKey, setApiKey] = useState("");
  const [models, setModels] = useState("");
  const savedModels = useRef(
    new Set(initial?.customModels.map((model) => model.id)),
  );
  const [savedId, setSavedId] = useState<string | null>(provider?.id ?? null);
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState<"form" | "remove" | "refreshIssue">("form");
  const [error, setError] = useState<string | null>(null);
  const [pendingChange, setPendingChange] = useState<ProviderSettingsChange>();
  const inputId = useId();
  useEffect(() => {
    onBusyChange(busy);
  }, [busy, onBusyChange]);
  useEffect(() => () => onBusyChange(false), [onBusyChange]);

  const refresh = useCallback(
    async (change: ProviderSettingsChange) => {
      setPendingChange(change);
      try {
        await onChanged(change);
        onClose();
      } catch (caught) {
        setStep("refreshIssue");
        setError(
          `Changes were saved, but providers could not be reloaded. ${providerErrorMessage(caught)}`,
        );
      }
    },
    [onChanged, onClose],
  );

  const handleSave = useCallback<FormEventHandler<HTMLFormElement>>(
    (event) => {
      event.preventDefault();
      if (busy) return;
      const providerId = id.trim();
      if (!/^[a-z0-9][a-z0-9_-]*$/.test(providerId)) {
        setError(
          "Use lowercase letters, digits, hyphens, and underscores for the provider ID.",
        );
        return;
      }
      if (!name.trim()) {
        setError("Enter a display name.");
        return;
      }
      let validURL = false;
      try {
        const url = new URL(baseURL.trim());
        validURL =
          ["http:", "https:"].includes(url.protocol) &&
          !url.username &&
          !url.password &&
          !url.search &&
          !url.hash;
      } catch {
        validURL = false;
      }
      if (!validURL) {
        setError(
          "Enter an HTTP(S) API base URL without credentials, query parameters, or a fragment.",
        );
        return;
      }
      setBusy(true);
      setError(null);
      void (async () => {
        let persisted = false;
        let persistedProviderId = providerId;
        let pendingModel: string | undefined;
        try {
          const fields = {
            name: name.trim(),
            baseURL: baseURL.trim(),
            credentialType,
          };
          const result = savedId
            ? await update({ providerId: savedId, ...fields })
            : await add({ id: providerId, ...fields });
          persisted = true;
          persistedProviderId = result.id;
          setSavedId(result.id);
          setId(result.id);
          if (credentialType === "api" && apiKey.trim())
            await configure({ providerId: result.id, apiKey: apiKey.trim() });
          const modelIds = new Set(
            models
              .split(/\r?\n/)
              .map((value) => normalizeModelId(result.id, value))
              .filter(Boolean),
          );
          for (const modelId of modelIds) {
            if (savedModels.current.has(modelId)) continue;
            pendingModel = modelId;
            await addModel({ providerId: result.id, modelId });
            savedModels.current.add(modelId);
          }
          await refresh({ providerId: result.id });
        } catch (caught) {
          const message = `${persisted ? "Provider definition is saved. " : ""}${pendingModel ? `Could not add model ${pendingModel}. ` : ""}${providerErrorMessage(caught)}`;
          setError(message);
          if (persisted) {
            try {
              await onChanged({ providerId: persistedProviderId });
            } catch {
              setError(
                `${message} Providers could not be reloaded; reopen settings to refresh.`,
              );
            }
          }
        } finally {
          setBusy(false);
        }
      })();
    },
    [
      add,
      addModel,
      models,
      apiKey,
      baseURL,
      busy,
      configure,
      credentialType,
      id,
      name,
      onChanged,
      refresh,
      savedId,
      update,
    ],
  );

  const handleRemove = useCallback(() => {
    if (!savedId || busy) return;
    setBusy(true);
    setError(null);
    void (async () => {
      try {
        await remove({ providerId: savedId });
        await refresh({ providerId: savedId });
      } catch (caught) {
        setError(providerErrorMessage(caught));
      } finally {
        setBusy(false);
      }
    })();
  }, [busy, refresh, remove, savedId]);
  const retryRefresh = useCallback(() => {
    if (!pendingChange || busy) return;
    setBusy(true);
    void refresh(pendingChange).finally(() => setBusy(false));
  }, [busy, pendingChange, refresh]);

  return (
    <CustomProviderDialogRender
      inputId={inputId}
      id={id}
      name={name}
      baseURL={baseURL}
      credentialType={credentialType}
      apiKey={apiKey}
      models={models}
      onModelsChange={setModels}
      saved={savedId !== null}
      busy={busy}
      step={step}
      error={error}
      onIdChange={setId}
      onNameChange={setName}
      onBaseURLChange={setBaseURL}
      onCredentialTypeChange={setCredentialType}
      onApiKeyChange={setApiKey}
      onSubmit={handleSave}
      onClose={onClose}
      onAskRemove={() => {
        setStep("remove");
        setError(null);
      }}
      onCancelRemove={() => {
        setStep("form");
        setError(null);
      }}
      onConfirmRemove={handleRemove}
      onRetryRefresh={retryRefresh}
    />
  );
}

/** Draft endpoint fields and actions for the one active workflow. */
export interface CustomProviderDialogRenderProps {
  /** Accessible field-ID prefix. */
  readonly inputId: string;
  /** Provider identity, immutable once saved. */
  readonly id: string;
  /** Display name draft. */
  readonly name: string;
  /** Complete API prefix draft. */
  readonly baseURL: string;
  /** Authentication required by the endpoint. */
  readonly credentialType: "api" | "none";
  /** Optional new API key, never a stored credential. */
  readonly apiKey: string;
  /** Optional model IDs, one per line; persisted after the endpoint exists. */
  readonly models: string;
  /** Edit model IDs to add through separate commands. */
  readonly onModelsChange: (value: string) => void;
  /** Whether the definition has already been persisted. */
  readonly saved: boolean;
  /** Whether a command is pending. */
  readonly busy: boolean;
  /** One inline workflow step. */
  readonly step: "form" | "remove" | "refreshIssue";
  /** Safe local/server feedback. */
  readonly error: string | null;
  /** Edit identity before creation. */
  readonly onIdChange: (value: string) => void;
  /** Edit display name. */
  readonly onNameChange: (value: string) => void;
  /** Edit API prefix. */
  readonly onBaseURLChange: (value: string) => void;
  /** Edit authentication mode. */
  readonly onCredentialTypeChange: (value: "api" | "none") => void;
  /** Edit the optional new key. */
  readonly onApiKeyChange: (value: string) => void;
  /** Save the definition, optional key, and requested model additions. */
  readonly onSubmit: FormEventHandler<HTMLFormElement>;
  /** Close while preserving already-saved changes. */
  readonly onClose: () => void;
  /** Show removal confirmation within this workflow. */
  readonly onAskRemove: () => void;
  /** Return to the existing draft. */
  readonly onCancelRemove: () => void;
  /** Remove the saved definition and global key. */
  readonly onConfirmRemove: () => void;
  /** Retry the failed reload without repeating mutations. */
  readonly onRetryRefresh: () => void;
}

/**
 * Render endpoint editing or its inline removal/reload step.
 * @param {CustomProviderDialogRenderProps} props - Form data and actions.
 * @returns {React.ReactElement} Compact endpoint form without another modal.
 */
export function CustomProviderDialogRender({
  inputId,
  id,
  name,
  baseURL,
  credentialType,
  apiKey,
  models,
  onModelsChange,
  saved,
  busy,
  step,
  error,
  onIdChange,
  onNameChange,
  onBaseURLChange,
  onCredentialTypeChange,
  onApiKeyChange,
  onSubmit,
  onClose,
  onAskRemove,
  onCancelRemove,
  onConfirmRemove,
  onRetryRefresh,
}: CustomProviderDialogRenderProps) {
  if (step === "refreshIssue")
    return (
      <div className={styles.form}>
        <p role="alert" className={styles.error}>
          {error}
        </p>
        <div className={styles.actions}>
          <Button disabled={busy} onClick={onClose}>
            Close
          </Button>
          <Button disabled={busy} onClick={onRetryRefresh}>
            {busy ? "Reloading..." : "Retry reload"}
          </Button>
        </div>
      </div>
    );
  if (step === "remove")
    return (
      <div className={styles.form}>
        <p className={styles.message}>
          Remove this custom provider, its manual models, and its saved global
          key?
        </p>
        <p className={styles.notice}>
          Environment and strategy credentials are not removed.
        </p>
        {error && (
          <p role="alert" className={styles.error}>
            {error}
          </p>
        )}
        <div className={styles.actions}>
          <Button disabled={busy} onClick={onCancelRemove}>
            Cancel
          </Button>
          <Button
            disabled={busy}
            className={styles.danger}
            onClick={onConfirmRemove}
          >
            {busy ? "Removing..." : "Remove provider"}
          </Button>
        </div>
      </div>
    );
  return (
    <form noValidate onSubmit={onSubmit} className={styles.form}>
      <div className={styles.field}>
        <label htmlFor={`${inputId}-id`}>Provider ID</label>
        <Input
          id={`${inputId}-id`}
          value={id}
          disabled={busy || saved}
          autoComplete="off"
          spellCheck={false}
          onChange={(event) => onIdChange(event.target.value)}
          placeholder="my-provider"
        />
      </div>
      <div className={styles.field}>
        <label htmlFor={`${inputId}-name`}>Display name</label>
        <Input
          id={`${inputId}-name`}
          value={name}
          disabled={busy}
          onChange={(event) => onNameChange(event.target.value)}
        />
      </div>
      <div className={styles.field}>
        <label htmlFor={`${inputId}-url`}>API base URL</label>
        <Input
          id={`${inputId}-url`}
          type="url"
          value={baseURL}
          disabled={busy}
          autoComplete="off"
          spellCheck={false}
          onChange={(event) => onBaseURLChange(event.target.value)}
          placeholder="http://localhost:1234/v1"
        />
        <p className={styles.notice}>
          Include the API prefix, such as /v1, when your server requires it.
        </p>
      </div>
      <div className={styles.field}>
        <label htmlFor={`${inputId}-auth`}>Authentication</label>
        <select
          id={`${inputId}-auth`}
          className={styles.select}
          value={credentialType}
          disabled={busy}
          onChange={(event) =>
            onCredentialTypeChange(event.target.value as "api" | "none")
          }
        >
          <option value="api">API key</option>
          <option value="none">None</option>
        </select>
      </div>
      {credentialType === "api" && (
        <div className={styles.field}>
          <label htmlFor={`${inputId}-key`}>API key (optional)</label>
          <Input
            id={`${inputId}-key`}
            type="password"
            autoComplete="new-password"
            value={apiKey}
            disabled={busy}
            spellCheck={false}
            onChange={(event) => onApiKeyChange(event.target.value)}
          />
          <p className={styles.notice}>
            Leave blank to configure a key later
            {saved ? " or keep the existing key" : ""}.
          </p>
        </div>
      )}
      <div className={styles.field}>
        <label htmlFor={`${inputId}-models`}>Models (optional)</label>
        <TextArea
          id={`${inputId}-models`}
          value={models}
          rows={3}
          disabled={busy}
          autoComplete="off"
          spellCheck={false}
          placeholder={"model-name\nanother-model"}
          onChange={(event) => onModelsChange(event.target.value)}
        />
        <p className={styles.notice}>
          One model ID per line. The provider prefix is added automatically.
        </p>
      </div>
      <p className={styles.notice}>
        Verification is not available for custom endpoints.
      </p>
      {error && (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      )}
      <div className={styles.actions}>
        {saved && (
          <div className={styles.secondaryActions}>
            <Button
              className={styles.danger}
              disabled={busy}
              onClick={onAskRemove}
            >
              Remove provider
            </Button>
          </div>
        )}
        <Button disabled={busy} onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" disabled={busy}>
          {busy ? "Saving..." : "Save"}
        </Button>
      </div>
    </form>
  );
}
