import { useCallback, useEffect, useId, useRef, useState } from "react";
import type { ChangeEventHandler, FormEventHandler, Ref } from "react";
import { Button } from "../../../design-system/Button";
import { useSettings } from "../../../hooks/useSettings";
import { validateDaemonUrl } from "../../../settings";
import { SettingsPanel } from "../SettingsPanel";
import { Input } from "../../../design-system/Input";
import styles from "./GeneralSettings.module.scss";

/** General section lifecycle and modal dismissal. */
export interface GeneralSettingsProps {
  /** Whether this section is currently visible. */
  readonly active: boolean;
  /** Close the settings modal, discarding the local draft. */
  readonly onClose: () => void;
}

/**
 * Own the daemon URL draft, validation, save feedback, and persistence.
 * @param {GeneralSettingsProps} props - Section visibility and dismissal.
 * @returns {React.ReactElement} The self-contained general settings form.
 */
export function GeneralSettings({ active, onClose }: GeneralSettingsProps) {
  const { settings, notice, saveSettings } = useSettings();
  const [url, setUrl] = useState(settings.daemon.url);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const handleChange = useCallback<ChangeEventHandler<HTMLInputElement>>(
    (event) => {
      setUrl(event.target.value);
      setFieldError(null);
      setSaveError(null);
      setSaved(false);
    },
    [],
  );
  const handleSave = useCallback<FormEventHandler<HTMLFormElement>>(
    (event) => {
      event.preventDefault();
      setSaved(false);
      setSaveError(null);
      const error = validateDaemonUrl(url);
      setFieldError(error);
      if (error) {
        inputRef.current?.focus();
        return;
      }
      const result = saveSettings({ ...settings, daemon: { url } });
      if (result.type === "error") {
        setSaveError(result.message);
        return;
      }
      setUrl(result.settings.daemon.url);
      setSaved(true);
    },
    [url, settings, saveSettings],
  );
  useEffect(() => {
    if (!active) setSaved(false);
  }, [active]);
  useEffect(() => {
    if (!saved) return;
    const timer = window.setTimeout(() => setSaved(false), 3000);
    return () => window.clearTimeout(timer);
  }, [saved]);
  return (
    <form noValidate onSubmit={handleSave} className={styles.form}>
      <SettingsPanel
        title="General Settings"
        onClose={onClose}
        footerActions={<Button type="submit">Save</Button>}
        feedback={
          <>
            {saveError && (
              <p className={styles.message} role="alert">
                {saveError}
              </p>
            )}
            <span role="status">{saved ? "Saved" : ""}</span>
          </>
        }
      >
        {notice && (
          <p className={styles.notice} role="status">
            {notice}
          </p>
        )}
        <GeneralSettingsRender
          inputId={inputId}
          inputRef={inputRef}
          url={url}
          error={fieldError}
          onChange={handleChange}
        />
      </SettingsPanel>
    </form>
  );
}

/** Draft daemon endpoint and validation state. */
export interface GeneralSettingsRenderProps {
  /** Unique field identifier. */
  readonly inputId: string;
  /** Current endpoint draft. */
  readonly url: string;
  /** Validation feedback shown after an invalid save. */
  readonly error: string | null;
  /** Input reference used to focus validation errors. */
  readonly inputRef: Ref<HTMLInputElement>;
  /** Update the endpoint draft. */
  readonly onChange: ChangeEventHandler<HTMLInputElement>;
}

/**
 * Edit the daemon connection address without attempting a connection.
 * @param {GeneralSettingsRenderProps} props - Endpoint field and validation state.
 * @returns {React.ReactElement} The general settings fields.
 */
export function GeneralSettingsRender({
  inputId,
  url,
  error,
  inputRef,
  onChange,
}: GeneralSettingsRenderProps) {
  return (
    <div className={styles.field}>
      <label htmlFor={inputId}>Daemon WebSocket URL</label>
      <Input
        ref={inputRef}
        id={inputId}
        value={url}
        onChange={onChange}
        inputMode="url"
        autoComplete="url"
        spellCheck={false}
        aria-invalid={Boolean(error)}
        aria-describedby={`${inputId}-hint${error ? ` ${inputId}-error` : ""}`}
      />
      <p id={`${inputId}-hint`} className={styles.hint}>
        Enter the full ws:// or wss:// endpoint.
      </p>
      {error && (
        <p id={`${inputId}-error`} className={styles.error} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
