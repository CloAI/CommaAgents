import { useId, useRef, useState } from "react";
import type { FormEvent } from "react";
import { Input } from "../../../../design-system/Input";
import { Button } from "../../../../design-system/Button";
import { useDaemonMutation } from "../../../../hooks/useDaemonMutation";
import type { DiscoveredProvider } from "../ProvidersSettings.types";
import { MODEL_CAPABILITIES } from "../ProvidersSettings.constants";
import {
  COST_FIELDS,
  EMPTY_CAPABILITIES,
  EMPTY_MODEL_DRAFT,
  MODALITIES,
  TOKEN_FIELDS,
} from "./AddModelDialog.constants";
import type {
  CapabilityDraft,
  ModalityDraft,
  ModelDraft,
} from "./AddModelDialog.types";
import {
  modelErrorMessage,
  parseModelMetadata,
  normalizeModelId,
} from "./AddModelDialog.utils";
import styles from "./AddModelDialog.module.scss";

/** Model form content; the provider workspace owns its single workflow modal. */
export interface AddModelDialogProps {
  /** All known providers, including providers with no models yet. */
  readonly providers: readonly DiscoveredProvider[];
  /** Provider selected by the invoking row or single provider filter. */
  readonly initialProviderId?: string;
  /** Dismiss the workflow modal. */
  readonly onClose: () => void;
  /** Refresh the provider browser after a successful model addition. */
  readonly onChanged: () => Promise<void>;
  /** Prevent closing the workflow while an explicit save or refresh is pending. */
  readonly onBusyChange?: (busy: boolean) => void;
}

/**
 * Add one provider-local model with optional metadata through a daemon command.
 * @param {AddModelDialogProps} props - Provider choices and workflow callbacks.
 * @returns {React.ReactElement} Model form and localized save/refresh feedback.
 */
export function AddModelDialog({
  providers,
  initialProviderId = "",
  onClose,
  onChanged,
  onBusyChange = () => undefined,
}: AddModelDialogProps) {
  const [providerId, setProviderId] = useState(initialProviderId);
  const [draft, setDraft] = useState<ModelDraft>({ ...EMPTY_MODEL_DRAFT });
  const [capabilities, setCapabilities] = useState<CapabilityDraft>({
    ...EMPTY_CAPABILITIES,
  });
  const [modalities, setModalities] = useState<ModalityDraft>({
    input: [],
    output: [],
  });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const pending = useRef(false);
  const add = useDaemonMutation("core.providers.addCustomProviderModel");
  const configuration = useDaemonMutation("core.providers.getConfiguration");
  const refresh = async (): Promise<void> => {
    await onChanged();
    onClose();
  };
  const submit = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    if (pending.current) return;
    setError("");
    const modelId = normalizeModelId(providerId, draft.modelId);
    if (
      !providerId ||
      !providers.some((provider) => provider.id === providerId)
    ) {
      setError("Choose a provider.");
      return;
    }
    if (!modelId) {
      setError("Model ID is required.");
      return;
    }
    pending.current = true;
    setBusy(true);
    onBusyChange(true);
    try {
      if (!saved) {
        const metadata = parseModelMetadata(draft, capabilities, modalities);
        const current = await configuration.mutate({ providerId });
        if (current.customModels.some((model) => model.id === modelId))
          throw new Error(
            "A custom entry already exists for this model. Remove it before adding different metadata.",
          );
        await add.mutate({
          providerId,
          modelId,
          ...(Object.keys(metadata).length ? { metadata } : {}),
        });
        setSaved(true);
      }
      await refresh();
    } catch (caught) {
      setError(modelErrorMessage(caught));
    } finally {
      pending.current = false;
      setBusy(false);
      onBusyChange(false);
    }
  };
  return (
    <AddModelDialogRender
      providers={providers}
      providerId={providerId}
      draft={draft}
      capabilities={capabilities}
      modalities={modalities}
      error={error}
      busy={busy}
      saved={saved}
      onProviderChange={setProviderId}
      onDraftChange={(key, value) =>
        setDraft((current) => ({ ...current, [key]: value }))
      }
      onCapabilityChange={(key, value) =>
        setCapabilities((current) => ({ ...current, [key]: value }))
      }
      onModalityChange={(direction, value, checked) =>
        setModalities((current) => ({
          ...current,
          [direction]: checked
            ? [...current[direction], value]
            : current[direction].filter((item) => item !== value),
        }))
      }
      onSubmit={(event) => {
        void submit(event);
      }}
      onClose={onClose}
    />
  );
}

/** Presentation and draft callbacks for the add-model form. */
export interface AddModelDialogRenderProps {
  /** Searchable provider choices. */ readonly providers: readonly DiscoveredProvider[];
  /** Selected provider identity. */ readonly providerId: string;
  /** Current text drafts. */ readonly draft: ModelDraft;
  /** Optional capability values. */ readonly capabilities: CapabilityDraft;
  /** Optional input/output modalities. */ readonly modalities: ModalityDraft;
  /** Localized validation or request failure. */ readonly error: string;
  /** Whether a save or provider refresh is running. */ readonly busy: boolean;
  /** Whether persistence succeeded and only refresh needs retrying. */ readonly saved: boolean;
  /** Choose a provider. */ readonly onProviderChange: (value: string) => void;
  /** Update one text field. */ readonly onDraftChange: (
    key: keyof ModelDraft,
    value: string,
  ) => void;
  /** Toggle whether this model supports a capability. */ readonly onCapabilityChange: (
    key: keyof CapabilityDraft,
    value: CapabilityDraft[keyof CapabilityDraft],
  ) => void;
  /** Toggle one supported input/output modality. */ readonly onModalityChange: (
    direction: "input" | "output",
    value: string,
    checked: boolean,
  ) => void;
  /** Submit the form or retry its post-save refresh. */ readonly onSubmit: (
    event: FormEvent,
  ) => void;
  /** Dismiss the workflow. */ readonly onClose: () => void;
}

/**
 * Render a compact model metadata form without owning a dialog or network state.
 * @param {AddModelDialogRenderProps} props - Drafts, feedback, and input callbacks.
 * @returns {React.ReactElement} Provider/model fields and compact optional metadata groups.
 */
export function AddModelDialogRender({
  providers,
  providerId,
  draft,
  capabilities,
  modalities,
  error,
  busy,
  saved,
  onProviderChange,
  onDraftChange,
  onCapabilityChange,
  onModalityChange,
  onSubmit,
  onClose,
}: AddModelDialogRenderProps) {
  const id = useId();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const provider = providers.find((item) => item.id === providerId);
  const matches = providers.filter((item) =>
    `${item.name} ${item.id}`
      .toLowerCase()
      .includes(query.trim().toLowerCase()),
  );
  const chooseProvider = (value: string): void => {
    onProviderChange(value);
    setPickerOpen(false);
    setQuery("");
  };
  const existing = provider?.models.find(
    (model) => model.id === normalizeModelId(providerId, draft.modelId),
  );
  return (
    <form className={styles.form} onSubmit={onSubmit}>
      <div className={styles.fields}>
        <p className={styles.hint}>Only provider and model ID are required.</p>
        {saved ? (
          <p role="status" className={styles.hint}>
            Model saved. Refresh the provider list to finish.
          </p>
        ) : null}
        <fieldset disabled={busy || saved} className={styles.content}>
          <div
            className={styles.providerPicker}
            onBlur={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget)) {
                setPickerOpen(false);
                setQuery("");
              }
            }}
          >
            <label htmlFor={`${id}-provider`}>Provider</label>
            <Input
              id={`${id}-provider`}
              role="combobox"
              aria-required="true"
              aria-expanded={pickerOpen}
              aria-controls={`${id}-providers`}
              aria-autocomplete="list"
              aria-activedescendant={
                pickerOpen && matches.length
                  ? `${id}-provider-${Math.min(active, matches.length - 1)}`
                  : undefined
              }
              value={pickerOpen ? query : (provider?.name ?? "")}
              placeholder="Search providers"
              autoComplete="off"
              onFocus={() => {
                setPickerOpen(true);
                setQuery("");
                setActive(0);
              }}
              onClick={() => setPickerOpen(true)}
              onChange={(event) => {
                setQuery(event.target.value);
                setActive(0);
                setPickerOpen(true);
              }}
              onKeyDown={(event) => {
                if (event.nativeEvent.isComposing) return;
                if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                  event.preventDefault();
                  setPickerOpen(true);
                  setActive((current) =>
                    Math.max(
                      0,
                      Math.min(
                        matches.length - 1,
                        current + (event.key === "ArrowDown" ? 1 : -1),
                      ),
                    ),
                  );
                }
                if (event.key === "Escape" && pickerOpen) {
                  event.preventDefault();
                  event.stopPropagation();
                  setPickerOpen(false);
                  setQuery("");
                }
                if (event.key === "Enter" && pickerOpen) {
                  event.preventDefault();
                  const match = matches[Math.min(active, matches.length - 1)];
                  if (match) chooseProvider(match.id);
                }
              }}
            />
            {pickerOpen ? (
              <div
                id={`${id}-providers`}
                role="listbox"
                aria-label="Providers"
                className={styles.options}
              >
                {matches.length ? (
                  matches.map((item, index) => (
                    <button
                      id={`${id}-provider-${index}`}
                      key={item.id}
                      type="button"
                      role="option"
                      aria-selected={providerId === item.id}
                      data-active={index === active}
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => chooseProvider(item.id)}
                    >
                      <span>{item.name}</span>
                      <code>{item.id}</code>
                    </button>
                  ))
                ) : (
                  <p>No providers match.</p>
                )}
              </div>
            ) : null}
          </div>
          <div className={styles.field}>
            <label htmlFor={`${id}-model`}>Model ID</label>
            <span className={styles.modelIdField}>
              {providerId && (
                <code
                  className={styles.modelPrefix}
                  aria-hidden="true"
                  title={`${providerId}/`}
                >
                  {providerId}/
                </code>
              )}
              <Input
                id={`${id}-model`}
                aria-required="true"
                value={draft.modelId}
                onChange={(event) =>
                  onDraftChange(
                    "modelId",
                    normalizeModelId(providerId, event.target.value),
                  )
                }
                autoComplete="off"
                spellCheck={false}
                placeholder="model-name"
              />
            </span>
          </div>
          {existing ? (
            <p className={styles.hint}>
              This model is already listed. Existing catalog or discovered
              metadata stays authoritative; your fields fill missing values.
            </p>
          ) : null}
          <div className={styles.grid}>
            <label className={styles.field}>
              Display name
              <Input
                value={draft.name}
                onChange={(event) => onDraftChange("name", event.target.value)}
              />
            </label>
          </div>
          <fieldset className={styles.group}>
            <legend>Capabilities</legend>
            <div className={styles.capabilities}>
              {MODEL_CAPABILITIES.map(({ id: key, label, icon: Icon }) => (
                <Button
                  key={key}
                  className={styles.capabilityToggle}
                  aria-pressed={capabilities[key]}
                  onClick={() => onCapabilityChange(key, !capabilities[key])}
                >
                  <Icon aria-hidden="true" />
                  {label}
                </Button>
              ))}
            </div>
          </fieldset>
          <fieldset className={styles.group}>
            <legend>Token limits</legend>
            <div className={styles.grid}>
              {TOKEN_FIELDS.map(({ key, label }) => (
                <label key={key} className={styles.field}>
                  {label}
                  <Input
                    type="number"
                    min="0"
                    step="1"
                    value={draft[key]}
                    onChange={(event) => onDraftChange(key, event.target.value)}
                    placeholder="Unknown"
                  />
                </label>
              ))}
            </div>
          </fieldset>
          <details className={styles.advanced}>
            <summary>Advanced metadata</summary>
            <div className={styles.advancedContent}>
              <fieldset className={styles.group}>
                <legend>Modalities</legend>
                {(["input", "output"] as const).map((direction) => (
                  <div key={direction} className={styles.modalities}>
                    <span>{direction === "input" ? "Input" : "Output"}</span>
                    {MODALITIES.map((value) => (
                      <label key={value}>
                        <input
                          type="checkbox"
                          checked={modalities[direction].includes(value)}
                          onChange={(event) =>
                            onModalityChange(
                              direction,
                              value,
                              event.target.checked,
                            )
                          }
                        />
                        {value}
                      </label>
                    ))}
                  </div>
                ))}
              </fieldset>
              <fieldset className={styles.group}>
                <legend>Pricing (USD per million tokens)</legend>
                <div className={styles.grid}>
                  {COST_FIELDS.map(({ key, label }) => (
                    <label key={key} className={styles.field}>
                      {label}
                      <Input
                        type="number"
                        min="0"
                        step="any"
                        value={draft[key]}
                        onChange={(event) =>
                          onDraftChange(key, event.target.value)
                        }
                        placeholder="Unknown"
                      />
                    </label>
                  ))}
                </div>
              </fieldset>
              <div className={styles.grid}>
                <label className={styles.field}>
                  Knowledge cutoff
                  <Input
                    value={draft.knowledgeCutoff}
                    placeholder="YYYY-MM or YYYY-MM-DD"
                    onChange={(event) =>
                      onDraftChange("knowledgeCutoff", event.target.value)
                    }
                  />
                </label>
                <label className={styles.field}>
                  Release date
                  <Input
                    type="date"
                    value={draft.releaseDate}
                    onChange={(event) =>
                      onDraftChange("releaseDate", event.target.value)
                    }
                  />
                </label>
                <label className={styles.field}>
                  Last updated
                  <Input
                    type="date"
                    value={draft.lastUpdated}
                    onChange={(event) =>
                      onDraftChange("lastUpdated", event.target.value)
                    }
                  />
                </label>
                <label className={styles.field}>
                  Release status
                  <select
                    value={draft.status}
                    onChange={(event) =>
                      onDraftChange("status", event.target.value)
                    }
                  >
                    <option value="">Unknown</option>
                    <option value="alpha">Alpha</option>
                    <option value="beta">Beta</option>
                    <option value="deprecated">Deprecated</option>
                  </select>
                </label>
              </div>
            </div>
          </details>
        </fieldset>
        {error ? (
          <p role="alert" className={styles.error}>
            {saved
              ? "The model was saved, but providers could not be reloaded. "
              : ""}
            {error}
          </p>
        ) : null}
      </div>
      <footer className={styles.footer}>
        <Button onClick={onClose} disabled={busy}>
          {saved ? "Close" : "Cancel"}
        </Button>
        <Button type="submit" disabled={busy}>
          {busy ? "Saving..." : saved ? "Retry refresh" : "Save"}
        </Button>
      </footer>
    </form>
  );
}
