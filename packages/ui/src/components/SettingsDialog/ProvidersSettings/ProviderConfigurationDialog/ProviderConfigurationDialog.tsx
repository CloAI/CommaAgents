import { useController, useForm } from "react-hook-form";
import type { ControllerRenderProps } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { providerConfigurationSchema } from "./ProviderConfigurationDialog.schemas";
import { useCallback, useEffect, useId, useState } from "react";
import type { FormEventHandler } from "react";
import { Button } from "../../../../design-system/Button";
import { Modal } from "../../../../design-system/Modal";
import { Input } from "../../../../design-system/Input";
import { useCommaAgentsDaemon } from "../../../../hooks/useCommaAgentsDaemon";
import { useDaemonMutation } from "../../../../hooks/useDaemonMutation";
import type { DiscoveredProvider } from "../ProvidersSettings.types";
import type {
  ProviderConfiguration,
  ProviderConfigurationStep,
  ProviderSettingsChange,
  ProviderVerification,
} from "./ProviderConfigurationDialog.types";
import {
  providerErrorMessage,
  verificationMessage,
} from "./ProviderConfigurationDialog.utils";
import { ProviderSignIn } from "./ProviderSignIn";
import styles from "./ProviderConfigurationDialog.module.scss";

/** Provider configuration workflow shown in its own modal. */
export interface ProviderConfigurationDialogProps {
  /** Provider being configured. */
  readonly provider: DiscoveredProvider;
  /** Close the workflow, keeping any already-saved changes. */
  readonly onClose: () => void;
  /** Report the latest request-local verification, or that it no longer applies. */
  readonly onChanged: (change: ProviderSettingsChange) => void;
  /** Replace this workflow with the custom endpoint editor. */
  readonly onEditCustom: () => void;
  /** Replace this workflow with confirmation for a manual-model entry. */
  readonly onRemoveModel?: (modelId: string) => void;
}

/**
 * Save credentials and verify once where supported, without stacking dialogs.
 * @param {ProviderConfigurationDialogProps} props - Selected provider and lifecycle callbacks.
 * @returns {React.ReactElement} Credential form or inline confirmation/error step.
 */
export function ProviderConfigurationDialog({
  provider,
  onClose,
  onChanged,
  onEditCustom,
  onRemoveModel,
}: ProviderConfigurationDialogProps) {
  const query = useCommaAgentsDaemon(
    { command: "core.providers.getConfiguration" },
    { providerId: provider.id },
  );
  const { mutate: configure } = useDaemonMutation("core.providers.configure");
  const { mutate: verify } = useDaemonMutation("core.providers.verify");
  const { mutate: removeCredential } = useDaemonMutation(
    "core.providers.removeCredential",
  );
  const [configuration, setConfiguration] = useState<ProviderConfiguration>();
  const [authenticationMethod, setAuthenticationMethod] = useState<
    "api" | "oauth"
  >(provider.id === "github-copilot" ? "oauth" : "api");
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState<ProviderConfigurationStep>("form");
  const [error, setError] = useState<string | null>(null);
  const fieldId = useId();
  const current = configuration ?? query.data;
  const { control, handleSubmit, resetField } = useForm({
    resolver: zodResolver(
      providerConfigurationSchema(
        authenticationMethod === "api" &&
          provider.credentialType === "api" &&
          current?.authStatus !== "configured",
      ),
    ),
    defaultValues: { apiKey: "" },
  });
  const { field: apiKeyField, fieldState } = useController({
    control,
    name: "apiKey",
  });
  useEffect(() => {
    if (query.data?.authenticationMethod === "oauth") {
      setAuthenticationMethod("oauth");
    }
  }, [query.data?.authenticationMethod]);

  const finish = useCallback(
    (change: ProviderSettingsChange, verificationFailed = false) => {
      onChanged(change);
      if (!verificationFailed) {
        onClose();
        return;
      }
      setError(
        verificationMessage(change.verification?.status ?? "unavailable"),
      );
      setStep("verificationIssue");
    },
    [onChanged, onClose],
  );

  const handleConnected = useCallback(async () => {
    // Core saves the OAuth credential; sign-in does not generate a test response.
    finish({ providerId: provider.id });
  }, [finish, provider.id]);

  const handleSave = useCallback(
    async ({ apiKey }: { apiKey: string }) => {
      if (busy || !current) {
        return;
      }
      const key = apiKey.trim();
      setBusy(true);
      setError(null);
      try {
        const saved = key
          ? await configure({ providerId: provider.id, apiKey: key })
          : current;
        setConfiguration(saved);
        let verification: ProviderVerification | undefined;
        if (saved.verificationSupported && provider.credentialType === "api") {
          try {
            verification = await verify({ providerId: provider.id });
          } catch (caught) {
            verification = {
              providerId: provider.id,
              status: "unavailable",
              checkedAt: new Date().toISOString(),
            };
            setError(providerErrorMessage(caught));
          }
        }
        finish(
          { providerId: provider.id, verification },
          verification !== undefined &&
            !["verified", "unsupported"].includes(verification.status),
        );
      } catch (caught) {
        setError(providerErrorMessage(caught));
      } finally {
        setBusy(false);
      }
    },
    [
      busy,
      configure,
      current,
      finish,
      provider.id,
      provider.credentialType,
      verify,
    ],
  );

  const handleRemove = useCallback(() => {
    if (busy) {
      return;
    }
    setBusy(true);
    setError(null);
    void (async () => {
      try {
        setConfiguration(await removeCredential({ providerId: provider.id }));
        resetField("apiKey");
        finish({ providerId: provider.id });
      } catch (caught) {
        setError(providerErrorMessage(caught));
      } finally {
        setBusy(false);
      }
    })();
  }, [busy, finish, provider.id, removeCredential, resetField]);

  return (
    // Saving cannot be dismissed.
    <Modal
      open
      title={`${provider.authStatus === "configured" || provider.credentialType === "none" ? "Configure" : "Connect"} ${provider.name}`}
      onClose={() => !busy && onClose()}
      className={styles.modal}
    >
      <ProviderConfigurationDialogRender
        provider={provider}
        authenticationMethod={authenticationMethod}
        onAuthenticationMethod={setAuthenticationMethod}
        onSubscriptionConnected={handleConnected}
        onSubscriptionBusy={setBusy}
        configuration={current}
        loading={query.isLoading}
        loadError={query.errors?.message ?? query.clientError?.message}
        apiKeyField={apiKeyField}
        fieldError={fieldState.error?.message}
        fieldId={fieldId}
        busy={busy}
        step={step}
        error={error}
        onSubmit={handleSubmit(handleSave)}
        onChange={(value) => {
          apiKeyField.onChange(value);
          setError(null);
        }}
        onClose={onClose}
        onEdit={() => {
          setStep("form");
          setError(null);
        }}
        onRemove={() => {
          setStep("remove");
          setError(null);
        }}
        onConfirmRemove={handleRemove}
        onEditCustom={onEditCustom}
        onRemoveModel={onRemoveModel}
      />
    </Modal>
  );
}

/** Presentation and actions for the current credential workflow step. */
export interface ProviderConfigurationDialogRenderProps {
  /** Selected connection form; API-key behavior remains the default. */
  readonly authenticationMethod?: "api" | "oauth";
  /** Select a connection method while idle. */
  readonly onAuthenticationMethod?: (method: "api" | "oauth") => void;
  /** Reload after subscription sign-in succeeds. */
  readonly onSubscriptionConnected?: () => Promise<void>;
  /** Keep dismissal disabled during browser sign-in. */
  readonly onSubscriptionBusy?: (busy: boolean) => void;
  /** Selected provider identity and authentication type. */
  readonly provider: DiscoveredProvider;
  /** Effective secret-free configuration. */
  readonly configuration: ProviderConfiguration | undefined;
  /** Whether initial configuration is loading. */
  readonly loading: boolean;
  /** Initial daemon/client failure. */
  readonly loadError?: string;
  /** New key draft, never the stored key. */
  readonly apiKeyField: ControllerRenderProps<{ apiKey: string }, "apiKey">;
  /** Validation feedback for the new key. */
  readonly fieldError?: string;
  /** Accessible input identity. */
  readonly fieldId: string;
  /** A submitted operation is pending. */
  readonly busy: boolean;
  /** Inline form or confirmation step. */
  readonly step: ProviderConfigurationStep;
  /** Local operation feedback. */
  readonly error: string | null;
  /** Save credentials and run the check. */
  readonly onSubmit: FormEventHandler<HTMLFormElement>;
  /** Edit the new key draft. */
  readonly onChange: (value: string) => void;
  /** Leave the workflow. */
  readonly onClose: () => void;
  /** Return from a confirmation to the existing draft. */
  readonly onEdit: () => void;
  /** Ask to remove the saved global credential. */
  readonly onRemove: () => void;
  /** Perform confirmed credential removal. */
  readonly onConfirmRemove: () => void;
  /** Open the user-owned endpoint editor. */
  readonly onEditCustom: () => void;
  /** Open manual-entry removal in this same workflow modal. */
  readonly onRemoveModel?: (modelId: string) => void;
}

/**
 * Render a compact credential workflow without another modal.
 * @param {ProviderConfigurationDialogRenderProps} props - Current data and actions.
 * @returns {React.ReactElement} One inline workflow step.
 */
export function ProviderConfigurationDialogRender({
  provider,
  authenticationMethod = "api",
  onAuthenticationMethod,
  onSubscriptionConnected,
  onSubscriptionBusy,
  configuration,
  loading,
  loadError,
  apiKeyField,
  fieldError,
  fieldId,
  busy,
  step,
  error,
  onSubmit,
  onChange,
  onClose,
  onEdit,
  onRemove,
  onConfirmRemove,
  onEditCustom,
  onRemoveModel,
}: ProviderConfigurationDialogRenderProps) {
  if (step === "verificationIssue") {
    return (
      <div className={styles.form}>
        <p role="alert" className={styles.error}>
          {error}
        </p>
        <p className={styles.notice}>
          The key was saved. Continue with this configuration or edit the form.
        </p>
        <div className={styles.actions}>
          <Button onClick={onEdit}>Edit</Button>
          <Button onClick={onClose}>Continue</Button>
        </div>
      </div>
    );
  }
  if (step === "remove") {
    return (
      <div className={styles.form}>
        <p className={styles.message}>
          Remove the saved global credential for {provider.name}?
        </p>
        <p className={styles.notice}>
          Environment and strategy credentials remain available.
        </p>
        {error && (
          <p role="alert" className={styles.error}>
            {error}
          </p>
        )}
        <div className={styles.actions}>
          <Button disabled={busy} onClick={onEdit}>
            Cancel
          </Button>
          <Button
            disabled={busy}
            className={styles.danger}
            onClick={onConfirmRemove}
          >
            {busy ? "Removing..." : "Remove key"}
          </Button>
        </div>
      </div>
    );
  }
  return (
    <form className={styles.form} noValidate onSubmit={onSubmit}>
      {loading && !configuration && (
        <p role="status" className={styles.notice}>
          Loading configuration...
        </p>
      )}
      {loadError && !configuration && (
        <p role="alert" className={styles.error}>
          {loadError}
        </p>
      )}
      {configuration && (
        <>
          <p className={styles.notice}>
            {provider.credentialType === "none"
              ? "Connected. This provider requires no API key."
              : configuration.authStatus === "configured"
                ? "Connected. Configuration is present; access has not been verified in this form."
                : provider.id === "github-copilot"
                  ? "Sign in with GitHub to connect your Copilot subscription."
                  : "An API key is needed to connect this provider."}
          </p>
          {configuration.credentialSource === "environment" && (
            <p className={styles.notice}>
              The daemon's environment key takes precedence over a saved global
              key. Saving here does not replace that environment key.
            </p>
          )}
          {provider.id === "openai" && onAuthenticationMethod && (
            <div
              className={styles.authenticationMethods}
              aria-label="Connection method"
            >
              <Button
                disabled={busy}
                aria-pressed={authenticationMethod === "api"}
                onClick={() => onAuthenticationMethod("api")}
              >
                API key
              </Button>
              <Button
                disabled={busy}
                aria-pressed={authenticationMethod === "oauth"}
                onClick={() => onAuthenticationMethod("oauth")}
              >
                ChatGPT subscription
              </Button>
            </div>
          )}
          {configuration.authenticationMethod === "oauth" && (
            <p className={styles.notice}>
              Using{" "}
              {provider.id === "github-copilot" ? "GitHub Copilot" : "ChatGPT"}{" "}
              plan
              {configuration.accountEmail
                ? ` · ${configuration.accountEmail}`
                : ""}
              .
            </p>
          )}
          {authenticationMethod === "oauth" &&
          onSubscriptionConnected &&
          onSubscriptionBusy ? (
            <ProviderSignIn
              providerId={
                provider.id === "github-copilot" ? "github-copilot" : "openai"
              }
              onConnected={onSubscriptionConnected}
              onBusyChange={onSubscriptionBusy}
            />
          ) : provider.credentialType === "api" ? (
            <div className={styles.field}>
              <label htmlFor={fieldId}>
                {configuration.authStatus === "configured"
                  ? "New API key (optional)"
                  : "API key"}
              </label>
              <Input
                id={fieldId}
                type="password"
                autoComplete="new-password"
                spellCheck={false}
                {...apiKeyField}
                aria-invalid={Boolean(fieldError)}
                aria-describedby={fieldError ? `${fieldId}-error` : undefined}
                disabled={busy}
                onChange={(event) => onChange(event.target.value)}
                placeholder={
                  configuration.authStatus === "configured"
                    ? "Leave blank to keep the current key"
                    : "Enter API key"
                }
              />
              {fieldError && (
                <p
                  id={`${fieldId}-error`}
                  role="alert"
                  className={styles.error}
                >
                  {fieldError}
                </p>
              )}
            </div>
          ) : (
            provider.credentialType !== "none" && (
              <p className={styles.notice}>
                OAuth and other credential types cannot be configured in this
                interface yet.
              </p>
            )
          )}
          {!configuration.verificationSupported &&
            authenticationMethod !== "oauth" && (
              <p className={styles.notice}>
                Verification is not available for this provider. Saved
                configuration is shown as Connected.
              </p>
            )}
        </>
      )}
      {configuration && configuration.customModels.length > 0 && (
        <section aria-label="Custom models">
          <p className={styles.notice}>Custom models</p>
          <ul className={styles.manualModels}>
            {configuration.customModels.map((model) => (
              <li className={styles.manualModel} key={model.id}>
                <code>{model.id}</code>
                {onRemoveModel && (
                  <Button
                    disabled={busy}
                    onClick={() => onRemoveModel(model.id)}
                    aria-label={`Remove custom model ${model.id}`}
                  >
                    Remove
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
      {error && (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      )}
      <div className={styles.actions}>
        <div className={styles.secondaryActions}>
          {provider.origin === "user" && (
            <Button disabled={busy || !configuration} onClick={onEditCustom}>
              Edit provider
            </Button>
          )}
          {configuration?.hasSavedCredential && (
            <Button
              disabled={busy}
              className={styles.danger}
              onClick={onRemove}
            >
              {configuration.authenticationMethod === "oauth"
                ? "Remove saved sign-in"
                : "Remove saved key"}
            </Button>
          )}
        </div>
        <Button disabled={busy} onClick={onClose}>
          Cancel
        </Button>
        {authenticationMethod !== "oauth" &&
          (provider.credentialType === "api" ||
            provider.credentialType === "none") && (
            <Button type="submit" disabled={busy || !configuration}>
              {busy ? "Saving..." : "Save"}
            </Button>
          )}
      </div>
    </form>
  );
}
