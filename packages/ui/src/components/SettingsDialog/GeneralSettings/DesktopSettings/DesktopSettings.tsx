import { useCallback, useEffect, useId, useState } from "react";
import { Switch } from "../../../../design-system/Switch";
import type {
  DesktopSettings as DesktopSettingsValues,
  DesktopSettingsPatch,
  HostDesktopSettings,
} from "../../../../hooks/useHost";
import styles from "./DesktopSettings.module.scss";

/** Source of the desktop preferences to show. */
export interface DesktopSettingsProps {
  /** Host that stores the preferences. */
  readonly settings: HostDesktopSettings;
}

/** Shown when a failure carries no message of its own. */
const FALLBACK_ERROR = "The desktop setting could not be changed.";

/**
 * Switch desktop-only behavior on or off; each change applies at once.
 * @param {DesktopSettingsProps} props - Host that stores the preferences.
 * @returns {React.ReactElement | null} The desktop preferences, or nothing until they load.
 */
export function DesktopSettings({ settings }: DesktopSettingsProps) {
  const [values, setValues] = useState<DesktopSettingsValues | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const backgroundId = useId();
  const loginId = useId();

  useEffect(() => {
    let current = true;
    settings.get().then(
      (loaded) => current && setValues(loaded),
      (failure) =>
        current &&
        setError(failure instanceof Error ? failure.message : FALLBACK_ERROR),
    );
    return () => {
      current = false;
    };
  }, [settings]);

  const change = useCallback(
    async (patch: DesktopSettingsPatch) => {
      setSaving(true);
      setError(null);
      try {
        setValues(await settings.set(patch));
      } catch (failure) {
        setError(failure instanceof Error ? failure.message : FALLBACK_ERROR);
      } finally {
        setSaving(false);
      }
    },
    [settings],
  );

  if (!values) {
    return error ? (
      <p className={styles.error} role="alert">
        {error}
      </p>
    ) : null;
  }
  return (
    <div className={styles.group}>
      <div className={styles.row}>
        <div className={styles.text}>
          <span id={backgroundId}>Keep running in background</span>
          <p className={styles.hint}>
            Closing the window keeps the daemon and its runs going in the system
            tray. Quit from the tray to stop them.
          </p>
        </div>
        <Switch
          aria-labelledby={backgroundId}
          checked={values.keepRunningInBackground}
          disabled={saving}
          onCheckedChange={(keepRunningInBackground) =>
            void change({ keepRunningInBackground })
          }
        />
      </div>
      <div className={styles.row}>
        <div className={styles.text}>
          <span id={loginId}>Start on login</span>
          <p className={styles.hint}>
            {values.startOnLoginAvailable
              ? "Start hidden in the tray when you sign in."
              : "Not available on Linux or in development builds."}
          </p>
        </div>
        <Switch
          aria-labelledby={loginId}
          checked={values.startOnLogin}
          disabled={saving || !values.startOnLoginAvailable}
          onCheckedChange={(startOnLogin) => void change({ startOnLogin })}
        />
      </div>
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
