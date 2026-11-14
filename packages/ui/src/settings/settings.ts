import { DEFAULT_SETTINGS, SETTINGS_STORAGE_KEY } from "./settings.constants";
import type {
  Settings,
  SettingsLoadResult,
  SettingsRecord,
  SettingsSaveResult,
} from "./settings.types";
import { isSettingsRecord } from "./settings.utils";

/**
 * Load browser settings once without overwriting unreadable or unsupported records.
 * @returns {SettingsLoadResult} Settings and any recoverable storage notice.
 */
export function loadSettings(): SettingsLoadResult {
  try {
    const storedValue = window.localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (storedValue === null) {
      return { settings: DEFAULT_SETTINGS, notice: null };
    }
    const record: unknown = JSON.parse(storedValue);
    if (
      typeof record === "object" &&
      record !== null &&
      "version" in record &&
      record.version !== 1
    ) {
      return {
        settings: DEFAULT_SETTINGS,
        notice:
          "Saved settings use an unsupported version. Defaults are active until you save new settings.",
      };
    }
    if (
      !isSettingsRecord(record) ||
      validateDaemonUrl(record.daemon.url) !== null
    ) {
      return {
        settings: DEFAULT_SETTINGS,
        notice:
          "Saved settings are invalid. Defaults are active until you save new settings.",
      };
    }
    return {
      settings: normalizeSettings(record),
      notice: null,
    };
  } catch {
    return {
      settings: DEFAULT_SETTINGS,
      notice:
        "Saved settings could not be read. Defaults are active until you save new settings.",
    };
  }
}

/**
 * Validate and persist a versioned record without changing active state on failure.
 * @param {Settings} settings - Preferences to validate and save.
 * @returns {SettingsSaveResult} Saved preferences or a recoverable error.
 */
export function saveSettings(settings: Settings): SettingsSaveResult {
  const validationError = validateDaemonUrl(settings.daemon.url);
  if (validationError) {
    return { type: "error", message: validationError };
  }
  const savedSettings = normalizeSettings(settings);
  const record: SettingsRecord = { version: 1, ...savedSettings };
  try {
    window.localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(record));
    return { type: "success", settings: savedSettings };
  } catch {
    return {
      type: "error",
      message:
        "Settings could not be saved to this browser. Your changes are still available here; try saving again.",
    };
  }
}

/**
 * Validate a daemon endpoint without attempting a connection.
 * @param {string} value - Full WebSocket URL to validate.
 * @returns {string | null} A field error, or null when the URL is valid.
 */
export function validateDaemonUrl(value: string): string | null {
  if (!value.trim()) {
    return "Enter a daemon WebSocket URL.";
  }
  try {
    const endpoint = new URL(value.trim());
    if (
      !/^wss?:\/\//i.test(value.trim()) ||
      (endpoint.protocol !== "ws:" && endpoint.protocol !== "wss:") ||
      !endpoint.hostname
    ) {
      return "Use a full ws:// or wss:// URL with a hostname.";
    }
    if (endpoint.hash || endpoint.href.includes("#")) {
      return "Remove the fragment from the daemon URL.";
    }
    if (endpoint.username || endpoint.password) {
      return "Embedded credentials are not supported.";
    }
    return null;
  } catch {
    return "Use a full ws:// or wss:// URL with a hostname.";
  }
}

/**
 * Copy only supported fields, trimming the endpoint and dropping unset or empty entries.
 * @param {Settings} settings - Validated preferences.
 * @returns {Settings} Preferences safe to store and share.
 */
function normalizeSettings(settings: Settings): Settings {
  const strategyModelRoles = Object.fromEntries(
    Object.entries(settings.strategyModelRoles ?? {}).filter(
      ([, roles]) => Object.keys(roles).length > 0,
    ),
  );
  return {
    daemon: { url: settings.daemon.url.trim() },
    ...(settings.appearance === undefined
      ? {}
      : { appearance: settings.appearance }),
    ...(settings.modelRolePresets === undefined
      ? {}
      : { modelRolePresets: settings.modelRolePresets }),
    ...(settings.paneHues === undefined ? {} : { paneHues: settings.paneHues }),
    ...(settings.strategyPath === undefined
      ? {}
      : { strategyPath: settings.strategyPath }),
    ...(Object.keys(strategyModelRoles).length === 0
      ? {}
      : { strategyModelRoles }),
  };
}
