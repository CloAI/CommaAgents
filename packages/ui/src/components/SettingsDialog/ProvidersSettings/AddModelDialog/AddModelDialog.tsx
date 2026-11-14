import { useController, useForm, useWatch } from "react-hook-form";
import type {
  FieldErrors,
  UseFormRegister,
  ControllerRenderProps,
} from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { addModelSchema } from "./AddModelDialog.schemas";
import { useId, useRef, useState } from "react";
import type { FormEvent } from "react";
import { Input } from "../../../../design-system/Input";
import { Button } from "../../../../design-system/Button";
import { Modal } from "../../../../design-system/Modal";
import { useDaemonMutation } from "../../../../hooks/useDaemonMutation";
import type { DiscoveredProvider } from "../ProvidersSettings.types";
import { MODEL_CAPABILITIES } from "../../../ModelDetails";
import {
  COST_FIELDS,
  EMPTY_CAPABILITIES,
  EMPTY_MODEL_DRAFT,
  MODALITIES,
  TOKEN_FIELDS,
} from "./AddModelDialog.constants";
import type {
  AddModelValues,
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

/** Model form shown in its own modal. */
export interface AddModelDialogProps {
  /** All known providers, including providers with no models yet. */
  readonly providers: readonly DiscoveredProvider[];
  /** Provider selected by the invoking row or single provider filter. */
  readonly initialProviderId?: string;
  /** Dismiss the workflow modal. */
  readonly onClose: () => void;
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
}: AddModelDialogProps) {
  const {
    control,
    register,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(
      addModelSchema(providers.map((provider) => provider.id)),
    ),
    defaultValues: {
      providerId: initialProviderId,
      draft: { ...EMPTY_MODEL_DRAFT },
      capabilities: { ...EMPTY_CAPABILITIES },
      modalities: { input: [], output: [] },
    },
  });
  const { field: providerField } = useController({
    control,
    name: "providerId",
  });
  const { field: modelField } = useController({
    control,
    name: "draft.modelId",
  });
  const providerId = providerField.value;
  const draft = useWatch({ control, name: "draft" });
  const capabilities = useWatch({ control, name: "capabilities" });
  const modalities = useWatch({ control, name: "modalities" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const add = useDaemonMutation("core.providers.addCustomProviderModel");
  const configuration = useDaemonMutation("core.providers.getConfiguration");
  const submit = async ({
    providerId,
    draft,
    capabilities,
    modalities,
  }: AddModelValues): Promise<void> => {
    if (pending.current) {
      return;
    }
    setError("");
    const modelId = normalizeModelId(providerId, draft.modelId);
    pending.current = true;
    setBusy(true);
    try {
      const metadata = parseModelMetadata(draft, capabilities, modalities);
      const current = await configuration.mutate({ providerId });
      if (current.customModels.some((model) => model.id === modelId)) {
        throw new Error(
          "A custom entry already exists for this model. Remove it before adding different metadata.",
        );
      }
      await add.mutate({
        providerId,
        modelId,
        ...(Object.keys(metadata).length ? { metadata } : {}),
      });
      onClose();
    } catch (caught) {
      setError(modelErrorMessage(caught));
    } finally {
      pending.current = false;
      setBusy(false);
    }
  };
  return (
    // Saving cannot be dismissed.
    <Modal
      open
      title="Add Model"
      onClose={() => !busy && onClose()}
      className={styles.modal}
    >
      <AddModelDialogRender
        providers={providers}
        providerId={providerId}
        draft={draft}
        capabilities={capabilities}
        modalities={modalities}
        error={error}
        errors={errors}
        register={register}
        providerField={providerField}
        modelField={modelField}
        busy={busy}
        onCapabilityChange={(key, value) =>
          setValue(`capabilities.${key}`, value, { shouldDirty: true })
        }
        onModalityChange={(direction, value, checked) =>
          setValue(
            `modalities.${direction}`,
            checked
              ? [...modalities[direction], value]
              : modalities[direction].filter((modality) => modality !== value),
            { shouldDirty: true },
          )
        }
        onSubmit={(event) => {
          void handleSubmit(submit)(event);
        }}
        onClose={onClose}
      />
    </Modal>
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
  /** Whether a save is running. */ readonly busy: boolean;
  /** Register model text fields. */ readonly register: UseFormRegister<AddModelValues>;
  /** Controlled provider picker binding. */ readonly providerField: ControllerRenderProps<
    AddModelValues,
    "providerId"
  >;
  /** Controlled model ID with visible prefix normalization. */
  readonly modelField: ControllerRenderProps<AddModelValues, "draft.modelId">;
  /** Validation feedback from the model schema. */ readonly errors: FieldErrors<AddModelValues>;
  /** Toggle whether this model supports a capability. */ readonly onCapabilityChange: (
    key: keyof CapabilityDraft,
    value: CapabilityDraft[keyof CapabilityDraft],
  ) => void;
  /** Toggle one supported input/output modality. */ readonly onModalityChange: (
    direction: "input" | "output",
    value: string,
    checked: boolean,
  ) => void;
  /** Submit the form. */ readonly onSubmit: (event: FormEvent) => void;
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
  register,
  providerField,
  modelField,
  errors,
  onCapabilityChange,
  onModalityChange,
  onSubmit,
  onClose,
}: AddModelDialogRenderProps) {
  const id = useId();
  const [advancedOpen, setAdvancedOpen] = useState(false);
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
    providerField.onChange(value);
    setPickerOpen(false);
    setQuery("");
  };
  const existing = provider?.models.find(
    (model) => model.id === normalizeModelId(providerId, draft.modelId),
  );
  return (
    <form noValidate className={styles.form} onSubmit={onSubmit}>
      <div className={styles.fields}>
        <p className={styles.hint}>
          Add a custom model that isn’t shown in the model list. Choose its
          provider and enter the model ID, then add any optional details.
        </p>
        <fieldset disabled={busy} className={styles.content}>
          <div
            className={styles.providerPicker}
            onBlur={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget)) {
                setPickerOpen(false);
                setQuery("");
              }
            }}
          >
            <label htmlFor={`${id}-provider`}>
              Provider<span aria-hidden="true">*</span>
            </label>
            <Input
              id={`${id}-provider`}
              ref={providerField.ref}
              name={providerField.name}
              onBlur={providerField.onBlur}
              aria-invalid={Boolean(errors.providerId)}
              aria-describedby={
                errors.providerId ? `${id}-validation` : undefined
              }
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
                if (event.nativeEvent.isComposing) {
                  return;
                }
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
                  if (match) {
                    chooseProvider(match.id);
                  }
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
            <label htmlFor={`${id}-model`}>
              Model ID<span aria-hidden="true">*</span>
            </label>
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
                {...modelField}
                onChange={(event) =>
                  modelField.onChange(
                    normalizeModelId(providerId, event.target.value),
                  )
                }
                aria-invalid={Boolean(errors.draft?.modelId)}
                aria-describedby={
                  errors.draft?.modelId ? `${id}-validation` : undefined
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
              <Input {...register("draft.name")} />
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
                    {...register(`draft.${key}`)}
                    aria-invalid={Boolean(errors.draft?.[key])}
                    aria-describedby={
                      errors.draft?.[key] ? `${id}-validation` : undefined
                    }
                    placeholder="Unknown"
                  />
                </label>
              ))}
            </div>
          </fieldset>
          <details
            className={styles.advanced}
            onToggle={(event) => setAdvancedOpen(event.currentTarget.open)}
            open={
              advancedOpen ||
              Boolean(
                errors.draft &&
                Object.keys(errors.draft).some((key) =>
                  [
                    "knowledgeCutoff",
                    "releaseDate",
                    "lastUpdated",
                    "status",
                    ...COST_FIELDS.map((field) => field.key),
                  ].includes(key),
                ),
              )
            }
          >
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
                        {...register(`draft.${key}`)}
                        aria-invalid={Boolean(errors.draft?.[key])}
                        aria-describedby={
                          errors.draft?.[key] ? `${id}-validation` : undefined
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
                    {...register("draft.knowledgeCutoff")}
                    aria-invalid={Boolean(errors.draft?.knowledgeCutoff)}
                    aria-describedby={
                      errors.draft?.knowledgeCutoff
                        ? `${id}-validation`
                        : undefined
                    }
                    placeholder="YYYY-MM or YYYY-MM-DD"
                  />
                </label>
                <label className={styles.field}>
                  Release date
                  <Input
                    type="date"
                    {...register("draft.releaseDate")}
                    aria-invalid={Boolean(errors.draft?.releaseDate)}
                    aria-describedby={
                      errors.draft?.releaseDate ? `${id}-validation` : undefined
                    }
                  />
                </label>
                <label className={styles.field}>
                  Last updated
                  <Input
                    type="date"
                    {...register("draft.lastUpdated")}
                    aria-invalid={Boolean(errors.draft?.lastUpdated)}
                    aria-describedby={
                      errors.draft?.lastUpdated ? `${id}-validation` : undefined
                    }
                  />
                </label>
                <label className={styles.field}>
                  Release status
                  <select
                    {...register("draft.status")}
                    aria-invalid={Boolean(errors.draft?.status)}
                    aria-describedby={
                      errors.draft?.status ? `${id}-validation` : undefined
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
        {(errors.providerId || errors.draft) && (
          <p id={`${id}-validation`} role="alert" className={styles.error}>
            {errors.providerId?.message ??
              Object.keys(EMPTY_MODEL_DRAFT)
                .map((key) => errors.draft?.[key as keyof ModelDraft]?.message)
                .find(Boolean)}
          </p>
        )}
        {error ? (
          <p role="alert" className={styles.error}>
            {error}
          </p>
        ) : null}
      </div>
      <footer className={styles.footer}>
        <Button onClick={onClose} disabled={busy}>
          Cancel
        </Button>
        <Button type="submit" disabled={busy}>
          {busy ? "Saving..." : "Save"}
        </Button>
      </footer>
    </form>
  );
}
