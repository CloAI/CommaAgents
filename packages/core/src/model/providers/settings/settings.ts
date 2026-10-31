import { readFileSync } from "node:fs";
import { mkdir, writeFile, rename, rm } from "node:fs/promises";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";
import { getProviderSettingsPath } from "../../../defaults/defaults";
import { ProviderSettingsSchema } from "./settings.schemas";
import type { ProviderSettings } from "./settings.types";

let snapshot: { path: string; settings: ProviderSettings } | undefined;
let mutations: Promise<unknown> = Promise.resolve();

/** @internal Safe settings errors contain no file contents or credentials.
 * @param {string} code - Stable failure code.
 * @param {string} message - Safe public explanation.
 * @returns {Error} Coded error without submitted values.
 */
export function providerSettingsError(code: string, message: string): Error {
  return Object.assign(new Error(message), { code });
}

/** @internal Read and validate the settings file without changing loaded state.
 * @returns {ProviderSettings} Validated settings or empty settings for a missing file.
 */
export function readProviderSettings(): ProviderSettings {
  let raw: string;
  try {
    raw = readFileSync(getProviderSettingsPath(), "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT")
      return { version: 3, providers: [] };
    throw providerSettingsError(
      "PROVIDER_STORAGE_ERROR",
      "Provider settings could not be read.",
    );
  }
  try {
    return ProviderSettingsSchema.parse(JSON.parse(raw));
  } catch {
    throw providerSettingsError(
      "PROVIDER_STORAGE_ERROR",
      "Provider settings are invalid or use an unsupported version.",
    );
  }
}

/** Return a defensive copy of the lazily loaded declarative settings.
 * @example const settings = getProviderSettings();
 * @returns {ProviderSettings} Defensive copy of loaded settings.
 */
export function getProviderSettings(): ProviderSettings {
  const path = getProviderSettingsPath();
  if (!snapshot || snapshot.path !== path)
    snapshot = { path, settings: readProviderSettings() };
  return structuredClone(snapshot.settings);
}

/** @internal Install validated settings after successful persistence or reload.
 * @param {ProviderSettings} settings - Validated settings.
 * @returns {void} Nothing.
 */
export function installProviderSettings(settings: ProviderSettings): void {
  snapshot = { path: getProviderSettingsPath(), settings };
}

/** @internal Serialize provider mutations and reloads; a rejection does not poison the queue.
 * @param {() => Promise<Result>} operation - Mutation or reload to serialize.
 * @returns {Promise<Result>} Operation result.
 */
export function serializeProviderSettings<Result>(
  operation: () => Promise<Result>,
): Promise<Result> {
  const result = mutations.then(operation);
  mutations = result.catch(() => undefined);
  return result;
}

/** @internal Atomically replace settings. Failed writes do not alter the loaded snapshot.
 * @param {ProviderSettings} settings - Complete replacement settings.
 * @returns {Promise<void>} Resolves after persistence.
 */
export async function saveProviderSettings(
  settings: ProviderSettings,
): Promise<void> {
  const parsed = ProviderSettingsSchema.parse(settings);
  // Re-read before every write so malformed external edits are never silently overwritten.
  readProviderSettings();
  const path = getProviderSettingsPath();
  const temporary = `${path}.${randomUUID()}.tmp`;
  try {
    await mkdir(dirname(path), { recursive: true });
    await writeFile(temporary, JSON.stringify(parsed, null, 2), {
      mode: 0o600,
    });
    await rename(temporary, path);
  } catch {
    throw providerSettingsError(
      "PROVIDER_STORAGE_ERROR",
      "Provider settings could not be saved.",
    );
  } finally {
    await rm(temporary, { force: true }).catch(() => undefined);
  }
  installProviderSettings(parsed);
}
