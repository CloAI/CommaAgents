// Credential utility functions — platform helpers for credential storage.

import { homedir } from "node:os";
import { join } from "node:path";

/**
 * Resolve the platform-aware data directory for comma-agents.
 *
 * Respects platform conventions:
 * - macOS:   ~/Library/Application Support/comma-agents/
 * - Windows: %LOCALAPPDATA%/comma-agents/ (fallback ~/AppData/Local)
 * - Linux:   $XDG_DATA_HOME/comma-agents/ (fallback ~/.local/share)
 *
 * @example
 * ```ts
 * const dataDir = resolveDataDir();
 * // macOS:   "/Users/alice/Library/Application Support/comma-agents"
 * // Linux:   "/home/alice/.local/share/comma-agents"
 * // Windows: "C:\\Users\\alice\\AppData\\Local\\comma-agents"
 * ```
 */
export function resolveDataDir(): string {
  const platform = process.platform;

  if (platform === "win32") {
    const base =
      process.env.LOCALAPPDATA ?? join(homedir(), "AppData", "Local");
    return join(base, "comma-agents");
  }

  if (platform === "darwin") {
    return join(homedir(), "Library", "Application Support", "comma-agents");
  }

  // Linux and other Unix — XDG Base Directory Specification
  const base = process.env.XDG_DATA_HOME ?? join(homedir(), ".local", "share");
  return join(base, "comma-agents");
}

/** Default name for the credentials JSON file. */
export const CREDENTIALS_FILENAME = "credentials.json";

/**
 * Resolve the default path to the credentials JSON file.
 *
 * Convenience wrapper: `join(resolveDataDir(), "credentials.json")`.
 *
 * @example
 * ```ts
 * const backend = createJsonFileBackend({ filePath: resolveCredentialsPath() });
 * ```
 */
export function resolveCredentialsPath(): string {
  return join(resolveDataDir(), CREDENTIALS_FILENAME);
}
