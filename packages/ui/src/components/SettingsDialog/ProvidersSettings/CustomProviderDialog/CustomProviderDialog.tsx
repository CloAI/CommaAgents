import { useForm, useWatch } from "react-hook-form";
import type { FieldErrors, UseFormRegister } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { customProviderSchema } from "./CustomProviderDialog.schemas";
import type { CustomProviderValues } from "./CustomProviderDialog.types";
import { useCallback, useId, useRef, useState } from "react";
import type { FormEventHandler } from "react";
import { Button } from "../../../../design-system/Button";
import { Modal } from "../../../../design-system/Modal";
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
  readonly onChanged: (change: ProviderSettingsChange) => void;
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
  if (!data || !data.customProvider) {
    return (
      <Modal
        open
        title="Configure Custom Provider"
        onClose={props.onClose}
        className={styles.modal}
      >
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
      </Modal>
    );
  }
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
  const {
    register,
    control,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(customProviderSchema),
    defaultValues: {
      id: provider?.id ?? "",
      name: initial?.customProvider?.name ?? "",
      baseURL: initial?.customProvider?.baseURL ?? "",
      credentialType: initial?.customProvider?.credentialType ?? "api",
      apiKey: "",
      models: "",
    },
  });
  const credentialType = useWatch({ control, name: "credentialType" });
  const savedModels = useRef(
    new Set(initial?.customModels.map((model) => model.id)),
  );
  const [savedId, setSavedId] = useState<string | null>(provider?.id ?? null);
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState<"form" | "remove">("form");
  const [error, setError] = useState<string | null>(null);
  const inputId = useId();
  const handleSave = useCallback(
    async ({
      id,
      name,
      baseURL,
      credentialType,
      apiKey,
      models,
    }: CustomProviderValues) => {
      if (busy) {
        return;
      }
      const providerId = id;
      setBusy(true);
      setError(null);
      let persisted = false;
      let persistedProviderId = providerId;
      let pendingModel: string | undefined;
      try {
        const fields = {
          name: name.trim(),
          baseURL,
          credentialType,
        };
        const result = savedId
          ? await update({ providerId: savedId, ...fields })
          : await add({ id: providerId, ...fields });
        persisted = true;
        persistedProviderId = result.id;
        setSavedId(result.id);
        setValue("id", result.id);
        if (credentialType === "api" && apiKey.trim()) {
          await configure({ providerId: result.id, apiKey: apiKey.trim() });
        }
        const modelIds = new Set(
          models
            .split(/\r?\n/)
            .map((value) => normalizeModelId(result.id, value))
            .filter(Boolean),
        );
        for (const modelId of modelIds) {
          if (savedModels.current.has(modelId)) {
            continue;
          }
          pendingModel = modelId;
          await addModel({ providerId: result.id, modelId });
          savedModels.current.add(modelId);
        }
        onChanged({ providerId: result.id });
        onClose();
      } catch (caught) {
        setError(
          `${persisted ? "Provider definition is saved. " : ""}${pendingModel ? `Could not add model ${pendingModel}. ` : ""}${providerErrorMessage(caught)}`,
        );
        if (persisted) {
          onChanged({ providerId: persistedProviderId });
        }
      } finally {
        setBusy(false);
      }
    },
    [
      add,
      addModel,
      busy,
      configure,
      onChanged,
      onClose,
      savedId,
      setValue,
      update,
    ],
  );

  const handleRemove = useCallback(() => {
    if (!savedId || busy) {
      return;
    }
    setBusy(true);
    setError(null);
    void (async () => {
      try {
        await remove({ providerId: savedId });
        onChanged({ providerId: savedId });
        onClose();
      } catch (caught) {
        setError(providerErrorMessage(caught));
      } finally {
        setBusy(false);
      }
    })();
  }, [busy, onChanged, onClose, remove, savedId]);

  return (
    // Saving cannot be dismissed.
    <Modal
      open
      title={provider ? "Configure Custom Provider" : "Add Custom Provider"}
      onClose={() => !busy && onClose()}
      className={styles.modal}
    >
      <CustomProviderDialogRender
        inputId={inputId}
        credentialType={credentialType}
        saved={savedId !== null}
        busy={busy}
        step={step}
        error={error}
        errors={errors}
        onSubmit={handleSubmit(handleSave)}
        register={register}
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
      />
    </Modal>
  );
}

/** Draft endpoint fields and actions for the one active workflow. */
export interface CustomProviderDialogRenderProps {
  /** Accessible field-ID prefix. */
  readonly inputId: string;
  /** Register native endpoint fields with the form. */
  readonly register: UseFormRegister<CustomProviderValues>;
  /** Authentication required by the endpoint. */
  readonly credentialType: "api" | "none";
  /** Field validation feedback. */
  readonly errors: FieldErrors<CustomProviderValues>;
  /** Whether the definition has already been persisted. */
  readonly saved: boolean;
  /** Whether a command is pending. */
  readonly busy: boolean;
  /** One inline workflow step. */
  readonly step: "form" | "remove";
  /** Safe local/server feedback. */
  readonly error: string | null;
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
}

/**
 * Render endpoint editing or its inline removal step.
 * @param {CustomProviderDialogRenderProps} props - Form data and actions.
 * @returns {React.ReactElement} Compact endpoint form without another modal.
 */
export function CustomProviderDialogRender({
  inputId,
  register,
  credentialType,
  saved,
  busy,
  step,
  error,
  errors,
  onSubmit,
  onClose,
  onAskRemove,
  onCancelRemove,
  onConfirmRemove,
}: CustomProviderDialogRenderProps) {
  if (step === "remove") {
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
  }
  return (
    <form noValidate onSubmit={onSubmit} className={styles.form}>
      <div className={styles.field}>
        <label htmlFor={`${inputId}-id`}>Provider ID</label>
        <Input
          id={`${inputId}-id`}
          {...register("id")}
          aria-invalid={Boolean(errors.id)}
          aria-describedby={errors.id ? `${inputId}-id-error` : undefined}
          disabled={busy || saved}
          autoComplete="off"
          spellCheck={false}
          placeholder="my-provider"
        />
        {errors.id && (
          <p id={`${inputId}-id-error`} role="alert" className={styles.error}>
            {errors.id.message}
          </p>
        )}
      </div>
      <div className={styles.field}>
        <label htmlFor={`${inputId}-name`}>Display name</label>
        <Input
          id={`${inputId}-name`}
          {...register("name")}
          aria-invalid={Boolean(errors.name)}
          aria-describedby={errors.name ? `${inputId}-name-error` : undefined}
          disabled={busy}
        />
        {errors.name && (
          <p id={`${inputId}-name-error`} role="alert" className={styles.error}>
            {errors.name.message}
          </p>
        )}
      </div>
      <div className={styles.field}>
        <label htmlFor={`${inputId}-url`}>API base URL</label>
        <Input
          id={`${inputId}-url`}
          type="url"
          {...register("baseURL")}
          aria-invalid={Boolean(errors.baseURL)}
          aria-describedby={
            errors.baseURL ? `${inputId}-baseURL-error` : undefined
          }
          disabled={busy}
          autoComplete="off"
          spellCheck={false}
          placeholder="http://localhost:1234/v1"
        />
        {errors.baseURL && (
          <p
            id={`${inputId}-baseURL-error`}
            role="alert"
            className={styles.error}
          >
            {errors.baseURL.message}
          </p>
        )}
        <p className={styles.notice}>
          Include the API prefix, such as /v1, when your server requires it.
        </p>
      </div>
      <div className={styles.field}>
        <label htmlFor={`${inputId}-auth`}>Authentication</label>
        <select
          id={`${inputId}-auth`}
          className={styles.select}
          {...register("credentialType")}
          disabled={busy}
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
            {...register("apiKey")}
            disabled={busy}
            spellCheck={false}
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
          {...register("models")}
          rows={3}
          disabled={busy}
          autoComplete="off"
          spellCheck={false}
          placeholder={"model-name\nanother-model"}
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
