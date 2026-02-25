// Credential store — manages API keys in a local JSON file
//
// Location: ~/.local/share/comma-agents/auth.json
// Permissions: 0o600 (owner read/write only)
//
// Schema:
// {
//   "openai": { "key": "sk-..." },
//   "anthropic": { "key": "sk-ant-..." }
// }

import { join } from "node:path";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A single credential entry. */
export interface CredentialEntry {
  readonly key: string;
}

/** The full credential store schema. */
export type CredentialStore = Record<string, CredentialEntry>;

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

/**
 * Get the default credential store directory.
 *
 * Platform-specific:
 * - macOS: ~/Library/Application Support/comma-agents/
 * - Linux: ~/.local/share/comma-agents/
 * - Windows: %APPDATA%/comma-agents/
 *
 * Can be overridden via the `COMMA_AGENTS_DATA_DIR` env var.
 */
export function getDataDir(): string {
  const override = process.env.COMMA_AGENTS_DATA_DIR;
  if (override) return override;

  const platform = process.platform;
  const home = process.env.HOME ?? process.env.USERPROFILE ?? "";

  if (platform === "darwin") {
    return join(home, "Library", "Application Support", "comma-agents");
  }
  if (platform === "win32") {
    const appData = process.env.APPDATA ?? join(home, "AppData", "Roaming");
    return join(appData, "comma-agents");
  }
  // Linux and other Unix
  const xdgData = process.env.XDG_DATA_HOME ?? join(home, ".local", "share");
  return join(xdgData, "comma-agents");
}

/** Get the full path to the credential store file. */
export function getCredentialStorePath(): string {
  return join(getDataDir(), "auth.json");
}

// ---------------------------------------------------------------------------
// File permissions constant
// ---------------------------------------------------------------------------

/** File permissions for the credential store: owner read/write only. */
const CREDENTIAL_FILE_MODE = 0o600;

// ---------------------------------------------------------------------------
// Read / Write helpers
// ---------------------------------------------------------------------------

/**
 * Read the credential store from disk.
 * Returns an empty object if the file doesn't exist or is invalid.
 */
export async function readCredentialStore(path?: string): Promise<CredentialStore> {
  const storePath = path ?? getCredentialStorePath();

  try {
    const { readFile } = await import("node:fs/promises");
    const content = await readFile(storePath, "utf-8");
    const parsed = JSON.parse(content) as unknown;

    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      return {};
    }

    return parsed as CredentialStore;
  } catch {
    // File doesn't exist or is unreadable — that's fine
    return {};
  }
}

/**
 * Write the credential store to disk.
 * Creates the directory if it doesn't exist and sets permissions to 0o600.
 */
export async function writeCredentialStore(store: CredentialStore, path?: string): Promise<void> {
  const storePath = path ?? getCredentialStorePath();

  const { mkdir, writeFile, chmod } = await import("node:fs/promises");
  const { dirname } = await import("node:path");

  // Ensure directory exists
  await mkdir(dirname(storePath), { recursive: true });

  // Write atomically-ish: write content then set permissions
  const content = JSON.stringify(store, null, 2);
  await writeFile(storePath, content, { encoding: "utf-8", mode: CREDENTIAL_FILE_MODE });

  // Explicitly set permissions (writeFile mode may be masked by umask)
  try {
    await chmod(storePath, CREDENTIAL_FILE_MODE);
  } catch {
    // chmod may fail on Windows — best effort
  }
}

// ---------------------------------------------------------------------------
// CRUD operations
// ---------------------------------------------------------------------------

/**
 * Get the API key for a provider from the credential store.
 * Returns undefined if not found.
 */
export async function getCredential(
  providerID: string,
  storePath?: string,
): Promise<string | undefined> {
  const store = await readCredentialStore(storePath);
  return store[providerID]?.key;
}

/**
 * Set (or update) the API key for a provider in the credential store.
 */
export async function setCredential(
  providerID: string,
  apiKey: string,
  storePath?: string,
): Promise<void> {
  const store = await readCredentialStore(storePath);
  const updated: CredentialStore = {
    ...store,
    [providerID]: { key: apiKey },
  };
  await writeCredentialStore(updated, storePath);
}

/**
 * Remove a provider's API key from the credential store.
 * No-op if the provider doesn't have a stored key.
 */
export async function removeCredential(providerID: string, storePath?: string): Promise<void> {
  const store = await readCredentialStore(storePath);
  if (!(providerID in store)) return;

  const { [providerID]: _removed, ...remaining } = store;
  await writeCredentialStore(remaining, storePath);
}

/**
 * List all provider IDs that have stored credentials.
 */
export async function listCredentials(storePath?: string): Promise<ReadonlyArray<string>> {
  const store = await readCredentialStore(storePath);
  return Object.keys(store);
}

/**
 * Create a `readCredential` function suitable for passing to `resolveKey()`.
 * This bridges the credential store to the key resolution layer.
 */
export function createCredentialReader(
  storePath?: string,
): (providerID: string) => Promise<string | undefined> {
  return (providerID: string) => getCredential(providerID, storePath);
}
