import { z } from "zod/v4";
import { IPC_CHANNELS } from "../shared/ipc";
import type { DesktopSettings, DesktopSettingsPatch } from "../shared/ipc";
import type { IpcHub } from "./daemon-ipc";
import { readDesktopConfig, updateDesktopConfig } from "./desktop-config";

const PatchSchema = z
  .object({
    keepRunningInBackground: z.boolean().optional(),
    startOnLogin: z.boolean().optional(),
  })
  .strict();

/**
 * Decide whether closing the window keeps the app running in the tray.
 * @param {boolean | undefined} saved - The user's saved choice, if any.
 * @param {NodeJS.Platform} platform - Operating system.
 * @returns {boolean} The saved choice, otherwise the platform default.
 */
export function keepRunningInBackground(
  saved: boolean | undefined,
  platform: NodeJS.Platform,
): boolean {
  // TODO(linux): the default is off because GNOME hides tray icons without an
  // AppIndicator extension, which would leave a hidden window unreachable. Review
  // and solidify Linux tray and autostart support (detect a visible tray,
  // per-desktop defaults, an autostart entry).
  return saved ?? platform !== "linux";
}

/** The operating system's "open at login" entry for this app. */
export interface LoginItem {
  /** Whether this is a packaged build; a development run must not register itself. */
  readonly packaged: boolean;
  /** Whether the app currently starts at login. */
  isEnabled(): boolean;
  /** Register or remove the app's start at login. */
  setEnabled(enabled: boolean): void;
}

/** Stored and operating-system preferences, read and changed together. */
interface DesktopSettingsStore {
  /** Read the settings now in effect. */
  get(): DesktopSettings;
  /** Change settings and return those now in effect; throws when a change is unavailable. */
  set(patch: DesktopSettingsPatch): DesktopSettings;
  /** Whether closing the window should keep the app running. */
  keepRunning(): boolean;
}

/**
 * Combine the saved configuration with the operating system's login item.
 * @param {{ file: string; platform: NodeJS.Platform; loginItem: LoginItem }} options - Storage, platform and login item.
 * @returns {DesktopSettingsStore} The settings store.
 */
export function createDesktopSettings({
  file,
  platform,
  loginItem,
}: {
  readonly file: string;
  readonly platform: NodeJS.Platform;
  readonly loginItem: LoginItem;
}): DesktopSettingsStore {
  const loginAvailable =
    (platform === "darwin" || platform === "win32") && loginItem.packaged;
  const keepRunning = () =>
    keepRunningInBackground(readDesktopConfig(file).background, platform);
  const get = (): DesktopSettings => ({
    keepRunningInBackground: keepRunning(),
    startOnLogin: loginAvailable && loginItem.isEnabled(),
    startOnLoginAvailable: loginAvailable,
  });
  return {
    get,
    keepRunning,
    set({ keepRunningInBackground: background, startOnLogin }) {
      if (startOnLogin !== undefined && !loginAvailable) {
        throw new Error("Start on login is not available in this build.");
      }
      if (background !== undefined) {
        updateDesktopConfig(file, { background });
      }
      if (startOnLogin !== undefined) {
        loginItem.setEnabled(startOnLogin);
      }
      return get();
    },
  };
}

/**
 * Let the settings page read and change the preferences, from the application's own page only.
 * @param {IpcHub} ipcMain - IPC hub of the main process.
 * @param {DesktopSettingsStore} settings - Where preferences live.
 * @param {(url: string | undefined) => boolean} isTrusted - Sender trust check.
 * @returns {void}
 */
export function handleDesktopSettings(
  ipcMain: IpcHub,
  settings: DesktopSettingsStore,
  isTrusted: (url: string | undefined) => boolean,
): void {
  ipcMain.handle(IPC_CHANNELS.settingsGet, async (event) => {
    if (!isTrusted(event.senderFrame?.url)) {
      throw new Error("Untrusted sender");
    }
    return settings.get();
  });
  ipcMain.handle(IPC_CHANNELS.settingsSet, async (event, patch) => {
    if (!isTrusted(event.senderFrame?.url)) {
      throw new Error("Untrusted sender");
    }
    const parsed = PatchSchema.safeParse(patch);
    if (!parsed.success) {
      throw new Error("Invalid desktop settings change");
    }
    return settings.set(parsed.data);
  });
}
