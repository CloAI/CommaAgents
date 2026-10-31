import { listOpenAISubscriptionModels } from "./authentication/openai";
import { getProviderSettingsPath } from "../../defaults/defaults";
import {
  getProviderSettings,
  providerSettingsError,
} from "./settings/settings";
import type { ProviderSettings } from "./settings/settings.types";
import type {
  Credential,
  CredentialStore,
} from "../../credentials/credentials.types";
import {
  getCatalogModels,
  getCatalogProviderSync,
  listCatalogProviders,
} from "./catalog/index";
import { BUILT_IN_OVERRIDES } from "./providers.constant";
import type {
  ListModelsContext,
  ListModelsResult,
  ProviderDefinition,
} from "./providers.types";
import {
  createDefaultProviderDefinition,
  mergeModelInfo,
  mergeCatalogWithLive,
  sortModels,
} from "./providers.utils";

/** Per-lister timeout. Callers may override via the passed AbortSignal. */
const LIVE_LIST_TIMEOUT_MS = 5_000;

let providerRegistry = new Map<string, ProviderDefinition>();
let initializedPath: string | undefined;
let initialization: Promise<void> | undefined;

async function ensureInitialized(): Promise<void> {
  const path = getProviderSettingsPath();
  if (initializedPath === path) return;
  if (initialization) return initialization;
  initialization = (async () => {
    await registerCatalogProviders();
    for (const override of BUILT_IN_OVERRIDES) {
      const existing = providerRegistry.get(override.id);
      if (existing?.origin === "registered" || existing?.origin === "user")
        continue;
      providerRegistry.set(override.id, {
        ...existing,
        ...override,
        name: existing?.name ?? override.name,
        origin: "builtin",
      });
    }
    synchronizeProviderSettings(getProviderSettings());
    initializedPath = path;
  })();
  try {
    await initialization;
  } finally {
    initialization = undefined;
  }
}

/** @internal Validate ownership before replacing the persisted-provider runtime view.
 * @param {ProviderSettings} settings - Validated declarative configuration.
 * @returns {void} Nothing; throws before changing state on ownership conflicts.
 */
export function synchronizeProviderSettings(settings: ProviderSettings): void {
  providerRegistry = prepareProviderSettings(settings);
}

/** @internal Prepare a registry update without mutating the active registry.
 * @param {ProviderSettings} settings - Replacement declarative settings.
 * @returns {Map<string, ProviderDefinition>} Validated next provider registry.
 */
export function prepareProviderSettings(
  settings: ProviderSettings,
): Map<string, ProviderDefinition> {
  const next = new Map(
    [...providerRegistry].filter(
      ([, definition]) => definition.origin !== "user",
    ),
  );
  for (const provider of settings.providers) {
    if (provider.kind !== "custom") continue;
    if (next.has(provider.id))
      throw providerSettingsError(
        "CONFLICT",
        "Custom provider ID conflicts with an existing provider.",
      );
    next.set(provider.id, {
      id: provider.id,
      name: provider.definition.name,
      baseURL: provider.definition.baseURL,
      credentialType: provider.definition.credentialType,
      origin: "user",
      packageName: "@ai-sdk/openai-compatible",
      factoryName: "createOpenAICompatible",
    });
  }
  for (const provider of settings.providers) {
    if (provider.kind === "existing" && !next.has(provider.id))
      throw providerSettingsError(
        "NOT_FOUND",
        "Model settings reference an unknown provider.",
      );
  }
  return next;
}

async function registerCatalogProviders(): Promise<void> {
  const providers = await listCatalogProviders();
  for (const catalogProvider of providers) {
    if (
      ["registered", "user"].includes(
        providerRegistry.get(catalogProvider.id)?.origin ?? "",
      )
    )
      continue;
    const definition = createDefaultProviderDefinition(catalogProvider.id);
    if (definition) providerRegistry.set(catalogProvider.id, definition);
  }
}

/**
 * Register (or override) a provider definition. Custom registrations take
 * precedence over catalog-derived defaults and persist across catalog reloads.
 *
 * @example
 * ```ts
 * registerProviderDefinition({
 *   id: "acme",
 *   name: "Acme Labs",
 *   packageName: "@acme/ai-sdk",
 *   listModels: async () => [{ id: "acme-1", sources: ["provider"], metadata: {} }],
 * });
 * ```
 */
export function registerProviderDefinition(
  definition: ProviderDefinition,
): void {
  providerRegistry.set(definition.id, { ...definition, origin: "registered" });
}

/** Remove a previously registered provider, restoring catalog metadata when available. */
export function unregisterProviderDefinition(providerId: string): boolean {
  if (!providerRegistry.has(providerId)) return false;

  const defaultDefinition = createDefaultProviderDefinition(providerId);
  if (defaultDefinition === undefined) {
    providerRegistry.delete(providerId);
  } else {
    providerRegistry.set(providerId, defaultDefinition);
  }

  return true;
}

/** Reset all provider registrations. Primarily for tests. */
export function resetProviderRegistry(): void {
  providerRegistry = new Map();
  initializedPath = undefined;
  initialization = undefined;
}

/** Look up a single provider definition by id. */
export async function getProviderDefinition(
  providerId: string,
): Promise<ProviderDefinition | undefined> {
  await ensureInitialized();
  return providerRegistry.get(providerId);
}

/** Every registered provider definition, alphabetically by id. */
export async function listProviderDefinitions(): Promise<
  readonly ProviderDefinition[]
> {
  await ensureInitialized();
  await registerCatalogProviders();
  return [...providerRegistry.values()].sort((left, right) =>
    left.id.localeCompare(right.id),
  );
}

/**
 * Resolve the model list for a single provider.
 *
 * When `options.live` is false, catalog and manual models are returned. When `live`
 * is true and the provider defines `listModels`, the live response is
 * merged with the catalog baseline. Live errors fall back to catalog
 * (if any) and are reported via `result.discovery.error`.
 */
export async function listProviderModels(
  providerId: string,
  credential: Credential | undefined,
  options?: { readonly live?: boolean; readonly signal?: AbortSignal },
): Promise<ListModelsResult> {
  const definition = await getProviderDefinition(providerId);
  const catalogModels = await getCatalogModels(providerId);
  const live = options?.live ?? true;
  const finish = (result: ListModelsResult): ListModelsResult => {
    const byId = new Map(result.models.map((model) => [model.id, model]));
    const manual =
      getProviderSettings().providers.find((entry) => entry.id === providerId)
        ?.models ?? [];
    for (const model of manual) {
      const known = byId.get(model.id);
      const manualModel = {
        id: model.id,
        sources: ["user"] as const,
        metadata: model.metadata ?? {},
      };
      byId.set(
        model.id,
        known ? mergeModelInfo(manualModel, known) : manualModel,
      );
    }
    return { ...result, models: sortModels([...byId.values()]) };
  };

  const listModels =
    providerId === "openai" &&
    credential?.type === "oauth" &&
    definition?.origin !== "registered" &&
    definition?.origin !== "user"
      ? ({ signal }: ListModelsContext) =>
          listOpenAISubscriptionModels(credential, signal)
      : definition?.listModels;
  if (!live || !listModels) {
    return finish({
      models: sortModels(catalogModels),
      discovery: { status: !live ? "catalog_only" : "unsupported" },
    });
  }

  const context: ListModelsContext = {
    ...(credential ? { credential } : {}),
    signal: options?.signal ?? AbortSignal.timeout(LIVE_LIST_TIMEOUT_MS),
  };

  try {
    const liveModels = await listModels(context);
    if (liveModels.length === 0)
      return finish({
        models: catalogModels,
        discovery: { status: "empty", fetchedAt: new Date().toISOString() },
      });
    return finish({
      models: mergeCatalogWithLive(catalogModels, liveModels),
      discovery: { status: "live", fetchedAt: new Date().toISOString() },
    });
  } catch {
    return finish({
      models: catalogModels,
      discovery: { status: "error", error: "Live model discovery failed." },
    });
  }
}

/**
 * Resolve a credential for a provider via its credential store. Swallows
 * `undefined` (not found) cases so callers can treat missing credentials
 * as "skip live listing".
 */
export async function resolveCredentialForProvider(
  credentialStore: CredentialStore,
  providerId: string,
  scope?: string,
): Promise<Credential | undefined> {
  return await credentialStore.resolve(providerId, scope);
}

/** Convenience re-export: every provider definition paired with its models. */
export interface ProviderWithModels {
  readonly definition: ProviderDefinition;
  readonly result: ListModelsResult;
}

/** Resolve models for every registered provider in parallel. */
export async function listAllProviderModels(
  credentialStore: CredentialStore,
  options?: { readonly live?: boolean; readonly scope?: string },
): Promise<readonly ProviderWithModels[]> {
  const definitions = await listProviderDefinitions();

  return await Promise.all(
    definitions.map(async (definition): Promise<ProviderWithModels> => {
      const credential = await resolveCredentialForProvider(
        credentialStore,
        definition.id,
        options?.scope,
      );
      const result = await listProviderModels(definition.id, credential, {
        live: options?.live ?? true,
      });
      return { definition, result };
    }),
  );
}

/** Expose a snapshot of the current registry for inspection (test helper). */
export function getRegisteredProviderIds(): readonly string[] {
  return [...providerRegistry.keys()].sort();
}

/**
 * Synchronously look up a provider definition without triggering catalog
 * initialization. Custom registrations (via `registerProviderDefinition()`)
 * are written to the registry immediately, so this reliably finds them even
 * before the async catalog has loaded. Catalog-derived entries are only
 * found once initialization has completed elsewhere.
 *
 * Used by the provider resolver, which must never block model resolution
 * on a network fetch to the models.dev catalog.
 */
export function getRegisteredProviderSync(
  providerId: string,
): ProviderDefinition | undefined {
  return providerRegistry.get(providerId);
}

/** IDs of providers explicitly registered via `registerProviderDefinition()`, sorted. */
export function getCustomProviderIdsSync(): readonly string[] {
  return [...providerRegistry.entries()]
    .filter(
      ([, definition]) =>
        definition.origin === "registered" || definition.origin === "user",
    )
    .map(([id]) => id)
    .sort();
}

/**
 * Synchronously resolve the npm package name for a provider.
 *
 * Checks built-in overrides first (ollama, deepseek), then falls back to
 * the bundled catalog snapshot. Returns `undefined` for providers that have
 * no known package (the resolver may guess `@ai-sdk/<id>` in that case).
 *
 * Designed for sync paths like the provider resolver; async callers should
 * prefer `getProviderDefinition()` which reflects the live registry.
 */
export function getProviderPackageNameSync(
  providerId: string,
): string | undefined {
  const override = BUILT_IN_OVERRIDES.find((entry) => entry.id === providerId);
  if (override?.packageName) return override.packageName;
  return getCatalogProviderSync(providerId)?.npm;
}

/** Check whether a provider is known to the runtime (catalog or built-in). */
export function isKnownProviderSync(providerId: string): boolean {
  if (BUILT_IN_OVERRIDES.some((entry) => entry.id === providerId)) return true;
  return getCatalogProviderSync(providerId) !== undefined;
}

export type { ModelInfo } from "./providers.types";
