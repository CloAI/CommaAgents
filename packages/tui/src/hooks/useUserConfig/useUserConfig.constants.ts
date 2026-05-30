import { homedir, platform } from "node:os";
import { join } from "node:path";

import { DEFAULT_THEME_NAME } from "../../Theme/themes";
import type { UserConfig } from "./useUserConfig.types";

/** Subdirectory under the OS config dir that holds all comma-agents files. */
export const CONFIG_SUBDIRECTORY = "comma-agents";

/** Filename of the persisted TUI configuration. */
export const CONFIG_FILE_NAME = "tui-config.json";

/** Defaults applied when no config file exists or fields are missing. */
export const DEFAULT_USER_CONFIG: UserConfig = {
  themeName: DEFAULT_THEME_NAME,
};

/**
 * Resolve the platform-appropriate config directory root.
 *
 * - macOS: `~/Library/Application Support`
 * - Windows: `%APPDATA%` (falls back to `~/AppData/Roaming`)
 * - Linux/other: `$XDG_CONFIG_HOME` or `~/.config`
 */
export function resolveConfigRoot(): string {
  const currentPlatform = platform();
  if (currentPlatform === "darwin") {
    return join(homedir(), "Library", "Application Support");
  }
  if (currentPlatform === "win32") {
    return process.env.APPDATA ?? join(homedir(), "AppData", "Roaming");
  }
  return process.env.XDG_CONFIG_HOME ?? join(homedir(), ".config");
}

/** Absolute path to the TUI config file for this user. */
export function resolveDefaultConfigFilePath(): string {
  return join(resolveConfigRoot(), CONFIG_SUBDIRECTORY, CONFIG_FILE_NAME);
}
