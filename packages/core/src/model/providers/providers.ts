import type { Credential, CredentialStore } from "../../credentials/credentials.types";
import { getCatalogModels, getCatalogProviderSync, listCatalogProviders } from "./catalog/index";
import { listCopilotModels, listOllamaModels } from "./listers/index";
import type {
  ListModelsContext,
  ListModelsResult,
  ProviderDefinition,
} from "./providers.types";
import { mergeCatalogWithLive, sortModels } from "./providers.utils";

/** Per-lister timeout. Callers may override via the passed AbortSignal. */
const LIVE_LIST_TIMEOUT_MS = 5_000;

let providerRegistry = new Map<string, ProviderDefinition>();
let initialized = false;

async function ensureInitialized(): Promise<void> {
  if (initialized) return;
  initialized = true;
  await registerCatalogProviders();
  attachBuiltInListers();
}

async function registerCatalogProviders(): Promise<void> {
  const providers = await listCatalogProviders();
  for (const catalogProvider of providers) {
    if (providerRegistry.has(catalogProvider.id)) continue;
    providerRegistry.set(catalogProvider.id, {
      id: catalogProvider.id,
      name: catalogProvider.name,
      packageName: catalogProvider.npm,
    });
  }
}

/**
 * Built-in provider definitions that are either missing from the catalog or
 * need to override catalog metadata (typically `packageName`).
 *
 * - `ollama` is absent from models.dev (local runtime); hardcode the npm package.
 * - `deepseek` exists in the catalog but is listed as `@ai-sdk/openai-compatible`;
 *   we prefer the dedicated `@ai-sdk/deepseek` package.
 */
const BUILT_IN_OVERRIDES: readonly ProviderDefinition[] = [
  { id: "ollama", name: "Ollama", packageName: "ollama-ai-provider", listModels: listOllamaModels },
  { id: "deepseek", name: "DeepSeek", packageName: "@ai-sdk/deepseek" },
  { id: "github-copilot", name: "GitHub Copilot", listModels: listCopilotModels },
];

function attachBuiltInListers(): void {
  for (const override of BUILT_IN_OVERRIDES) {
    const existing = providerRegistry.get(override.id);
    // Override wins on packageName/listModels; catalog wins on display name when present.
    providerRegistry.set(override.id, {
      ...(existing ?? {}),
      ...override,
      name: existing?.name ?? override.name,
    });
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
 *   listModels: async () => [{ id: "acme-1" }],
 * });
 * ```
 */
export function registerProviderDefinition(definition: ProviderDefinition): void {
  providerRegistry.set(definition.id, { ...definition, isCustom: true });
}

/** Remove a previously registered provider. Catalog-derived entries return on next init. */
export function unregisterProviderDefinition(providerId: string): boolean {
  return providerRegistry.delete(providerId);
}

/** Reset all provider registrations. Primarily for tests. */
export function resetProviderRegistry(): void {
  providerRegistry = new Map();
  initialized = false;
}

/** Look up a single provider definition by id. */
export async function getProviderDefinition(
  providerId: string,
): Promise<ProviderDefinition | undefined> {
  await ensureInitialized();
  return providerRegistry.get(providerId);
}

/** Every registered provider definition, alphabetically by id. */
export async function listProviderDefinitions(): Promise<readonly ProviderDefinition[]> {
  await ensureInitialized();
  return [...providerRegistry.values()].sort((left, right) => left.id.localeCompare(right.id));
}

/**
 * Resolve the model list for a single provider.
 *
 * When `options.live` is false, only catalog data is returned. When `live`
 * is true and the provider defines `listModels`, the live response is
 * merged with the catalog baseline. Live errors fall back to catalog
 * (if any) and are reported via `result.error`.
 */
export async function listProviderModels(
  providerId: string,
  credential: Credential | undefined,
  options?: { readonly live?: boolean; readonly signal?: AbortSignal },
): Promise<ListModelsResult> {
  const definition = await getProviderDefinition(providerId);
  const catalogModels = await getCatalogModels(providerId);
  const live = options?.live ?? true;

  if (!live || !definition?.listModels) {
    return {
      models: sortModels(catalogModels),
      source: "catalog",
    };
  }

  const context: ListModelsContext = {
    ...(credential ? { credential } : {}),
    signal: options?.signal ?? AbortSignal.timeout(LIVE_LIST_TIMEOUT_MS),
  };

  try {
    const liveModels = await definition.listModels(context);
    const merged =
      catalogModels.length > 0 ? mergeCatalogWithLive(catalogModels, liveModels) : liveModels;
    const source = catalogModels.length > 0 && liveModels.length > 0 ? "merged" : "live";
    return {
      models: sortModels(merged),
      source,
      fetchedAt: new Date().toISOString(),
    };
  } catch (caughtError) {
    const message = caughtError instanceof Error ? caughtError.message : String(caughtError);
    if (catalogModels.length > 0) {
      return {
        models: sortModels(catalogModels),
        source: "catalog",
        error: message,
      };
    }
    return {
      models: [],
      source: "error",
      error: message,
    };
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
 * Synchronously resolve the npm package name for a provider.
 *
 * Checks built-in overrides first (ollama, deepseek), then falls back to
 * the bundled catalog snapshot. Returns `undefined` for providers that have
 * no known package (the resolver may guess `@ai-sdk/<id>` in that case).
 *
 * Designed for sync paths like the provider resolver; async callers should
 * prefer `getProviderDefinition()` which reflects the live registry.
 */
export function getProviderPackageNameSync(providerId: string): string | undefined {
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
