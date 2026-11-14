import type { Settings, SettingsSaveResult } from "../../settings";

/** Shared saved preferences and the explicit persistence operation. */
export interface SettingsContextValue {
  /** Settings active for this application session. */
  readonly settings: Settings;
  /** Recoverable loading notice, cleared by a successful save. */
  readonly notice: string | null;
  /** Persist preferences; active settings change only on success. */
  readonly saveSettings: (settings: Settings) => SettingsSaveResult;
}
