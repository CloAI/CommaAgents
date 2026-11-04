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
  loadCatalog,
  toModelInfo,
  getCatalogProviderSync,
  listCatalogProviders,
} from "./catalog/index";
import { BUILT_IN_OVERRIDES } from "./providers.constant";
import type {
  ListModelsContext,
  ModelInfo,
  ProviderDefinition,
} from "./providers.types";
import {
  createDefaultProviderDefinition,
  mergeModelInfo,
  mergeCatalogWithProvider,
  sortModels,
} from "./providers.utils";

/** Per-provider timeout for its own model listing. */
const PROVIDER_LIST_TIMEOUT_MS = 5_000;

/** Models last returned by each provider's own listing, keyed by provider ID. */
let providerModels = new Map<string, readonly ModelInfo[]>();

let providerRegistry = new Map<string, ProviderDefinition>();
let initializedPath: string | undefined;
let initialization: Promise<void> | undefined;

async function ensureInitialized(): Promise<void> {
  const path = getProviderSettingsPath();
  if (initializedPath === path) {
    return;
  }
  if (initialization) {
    return initialization;
  }
  initialization = (async () => {
    await registerCatalogProviders();
    for (const override of BUILT_IN_OVERRIDES) {
      const existing = providerRegistry.get(override.id);
      if (existing?.origin === "registered" || existing?.origin === "user") {
        continue;
      }
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
    if (provider.kind !== "custom") {
      continue;
    }
    if (next.has(provider.id)) {
      throw providerSettingsError(
        "CONFLICT",
        "Custom provider ID conflicts with an existing provider.",
      );
    }
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
    if (provider.kind === "existing" && !next.has(provider.id)) {
      throw providerSettingsError(
        "NOT_FOUND",
        "Model settings reference an unknown provider.",
      );
    }
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
    ) {
      continue;
    }
    const definition = createDefaultProviderDefinition(catalogProvider.id);
    if (definition) {
      providerRegistry.set(catalogProvider.id, definition);
    }
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
  if (!providerRegistry.has(providerId)) {
    return false;
  }

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
  providerModels = new Map();
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
 * Resolve one provider's models from models.dev, its last provider listing, and manual entries.
 * Never makes a network request; `refreshProviderModels()` updates the provider listing.
 * @param {string} providerId - Exact provider identity.
 * @returns {Promise<readonly ModelInfo[]>} Merged models, sorted by ID.
 */
export async function listProviderModels(
  providerId: string,
): Promise<readonly ModelInfo[]> {
  await loadCatalog();
  return listProviderModelsSync(providerId);
}

/**
 * Read merged model metadata already available to the runtime without I/O.
 * @param {string} providerId - Exact provider identity.
 * @returns {readonly ModelInfo[]} Cached catalog, provider, and manual models.
 * @internal
 */
export function listProviderModelsSync(
  providerId: string,
): readonly ModelInfo[] {
  const byId = new Map(
    mergeCatalogWithProvider(
      Object.values(getCatalogProviderSync(providerId)?.models ?? {}).map(
        toModelInfo,
      ),
      providerModels.get(providerId) ?? [],
    ).map((model) => [model.id, model]),
  );
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
  return sortModels([...byId.values()]);
}

/**
 * Ask providers for their model lists and keep the results for `listProviderModels()`.
 * A provider without a lister, a required credential, or a successful response keeps
 * only its models.dev and manual models.
 * @param {CredentialStore} credentialStore - Resolves each provider's credential.
 * @param {{providerId?: string}} [options] - One provider, or every registered provider.
 * @returns {Promise<void>} Resolves once every listing has settled.
 */
export async function refreshProviderModels(
  credentialStore: CredentialStore,
  options?: { readonly providerId?: string },
): Promise<void> {
  const providerIds = options?.providerId
    ? [options.providerId]
    : (await listProviderDefinitions()).map(({ id }) => id);
  await Promise.all(
    providerIds.map(async (providerId) => {
      const models = await fetchProviderModels(
        providerId,
        await resolveCredentialForProvider(credentialStore, providerId),
      );
      if (models?.length) {
        providerModels.set(providerId, models);
      } else {
        providerModels.delete(providerId);
      }
    }),
  );
}

/**
 * Call a provider's own model listing, when it has one and can be authenticated.
 * @param {string} providerId - Exact provider identity.
 * @param {Credential | undefined} credential - Resolved credential, if any.
 * @returns {Promise<readonly ModelInfo[] | undefined>} Listed models, or undefined when unavailable or failed.
 */
async function fetchProviderModels(
  providerId: string,
  credential: Credential | undefined,
): Promise<readonly ModelInfo[] | undefined> {
  const definition = await getProviderDefinition(providerId);
  if (!definition || (!credential && definition.credentialType !== "none")) {
    return undefined;
  }
  const listModels =
    providerId === "openai" &&
    credential?.type === "oauth" &&
    definition.origin !== "registered" &&
    definition.origin !== "user"
      ? ({ signal }: ListModelsContext) =>
          listOpenAISubscriptionModels(credential, signal)
      : definition.listModels;
  try {
    return await listModels?.({
      ...(credential ? { credential } : {}),
      signal: AbortSignal.timeout(PROVIDER_LIST_TIMEOUT_MS),
    });
  } catch {
    return undefined;
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
  if (override?.packageName) {
    return override.packageName;
  }
  return getCatalogProviderSync(providerId)?.npm;
}

/** Check whether a provider is known to the runtime (catalog or built-in). */
export function isKnownProviderSync(providerId: string): boolean {
  if (BUILT_IN_OVERRIDES.some((entry) => entry.id === providerId)) {
    return true;
  }
  return getCatalogProviderSync(providerId) !== undefined;
}

export type { ModelInfo } from "./providers.types";
