import type {
  AuthStatus,
  CredentialStore,
} from "../credentials/credentials.types";
import { ModelResolutionError } from "../errors/index";
import type { ParsedModel, ProviderInfo } from "./model.types";
import {
  getCatalogProviderSync,
  getProviderDefinition,
  getProviderPackageNameSync,
  getProvidersForModel,
  isKnownProviderSync,
  listAllProviderModels,
  listProviderModels,
  resolveCredentialForProvider,
  toModelInfo,
} from "./providers/index";
import type { ModelCapabilities, ModelInfo } from "./providers/providers.types";

/**
 * Parse a model string in the format `providerID/modelID`.
 *
 * The model ID may contain slashes (e.g., `"ollama/meta-llama/llama-3"`),
 * so only the first slash is used as the separator.
 *
 * @param modelString - Raw model string to parse.
 * @throws {ModelResolutionError} If the string is empty or has no slash separator.
 *
 * @example
 * ```ts
 * parseModel("openai/gpt-4o")
 * // => { providerId: "openai", modelId: "gpt-4o", packageName: "@ai-sdk/openai" }
 *
 * parseModel("ollama/meta-llama/llama-3")
 * // => { providerId: "ollama", modelId: "meta-llama/llama-3", packageName: "ollama-ai-provider" }
 * ```
 */
export function parseModel(modelString: string): ParsedModel {
  const trimmed = modelString?.trim() ?? "";

  if (trimmed.length === 0) {
    throw new ModelResolutionError(modelString, "Model string cannot be empty");
  }

  const slashIndex = trimmed.indexOf("/");

  if (slashIndex === -1) {
    throw new ModelResolutionError(
      trimmed,
      `Invalid model string "${trimmed}": expected format "providerID/modelID" (e.g., "openai/gpt-4o")`,
    );
  }

  if (slashIndex === 0) {
    throw new ModelResolutionError(
      trimmed,
      `Invalid model string "${trimmed}": provider ID cannot be empty`,
    );
  }

  const providerId = trimmed.slice(0, slashIndex);
  const modelId = trimmed.slice(slashIndex + 1);

  if (modelId.length === 0) {
    throw new ModelResolutionError(
      trimmed,
      `Invalid model string "${trimmed}": model ID cannot be empty`,
    );
  }

  return {
    providerId,
    modelId,
    packageName: getProviderPackageNameSync(providerId),
  };
}

/**
 * Check whether a provider is known to the runtime (catalog entry or
 * built-in override).
 */
export function isKnownProvider(providerId: string): boolean {
  return isKnownProviderSync(providerId);
}

/**
 * Get the npm package name for a known provider.
 *
 * Returns `undefined` for providers that have no catalog entry and no
 * built-in override; callers may fall back to guessing `@ai-sdk/<id>`.
 */
export function getProviderPackage(providerId: string): string | undefined {
  return getProviderPackageNameSync(providerId);
}

/**
 * Extract unique provider IDs from a raw (already-parsed) strategy object.
 *
 * Scans each agent's `model` field for "providerID/modelID" strings.
 * Returns the set of unique provider IDs. Works on pre-validation data —
 * silently skips invalid model strings so callers can discover required
 * providers before the full Zod validation pass.
 *
 * @param raw - Parsed but unvalidated strategy object.
 *
 * @example
 * ```ts
 * const raw = JSON.parse(strategyJson);
 * const providerIds = extractProviderIds(raw);
 * // => Set { "openai", "anthropic" }
 * ```
 */
export function extractProviderIds(raw: Record<string, unknown>): Set<string> {
  const providerIds = new Set<string>();

  const agents = raw.agents as
    | Record<string, Record<string, unknown>>
    | undefined;
  if (!agents) return providerIds;

  for (const agentDefinition of Object.values(agents)) {
    const model = agentDefinition.model;
    if (typeof model !== "string") continue;
    try {
      providerIds.add(parseModel(model).providerId);
    } catch {
      // Skip invalid model strings silently — validation happens later.
    }
  }

  return providerIds;
}

/**
 * Aggregate metadata for a single provider.
 *
 * Resolves the provider's models from the models.dev catalog (and,
 * when `live === true` and credentials are present, the provider's
 * live API). Auth status is a configuration-level check only.
 *
 * @param providerId - The provider ID to inspect.
 * @param credentialStore - The credential store used to check auth status.
 * @param options - `scope` for scoped credential resolution; `live` to enable live discovery.
 *
 * @example
 * ```ts
 * const info = await getProviderInfo("openai", credentialStore, { live: true });
 * // => { id: "openai", name: "OpenAI", authStatus: "configured", models: [...], modelsSource: "merged", isCustom: false }
 * ```
 */
export async function getProviderInfo(
  providerId: string,
  credentialStore: CredentialStore,
  options?: { readonly scope?: string; readonly live?: boolean },
): Promise<ProviderInfo> {
  const authStatus: AuthStatus = await credentialStore.getAuthStatus(
    providerId,
    options?.scope,
  );
  const credential =
    authStatus === "configured"
      ? await resolveCredentialForProvider(
          credentialStore,
          providerId,
          options?.scope,
        )
      : undefined;

  const definition = await getProviderDefinition(providerId);
  const result = await listProviderModels(providerId, credential, {
    live: options?.live ?? false,
  });

  return {
    id: providerId,
    name: definition?.name ?? formatProviderName(providerId),
    credentialType: definition?.credentialType ?? "api",
    authStatus,
    models: result.models,
    modelsSource: result.source,
    ...(result.fetchedAt ? { fetchedAt: result.fetchedAt } : {}),
    ...(result.error ? { error: result.error } : {}),
    isCustom: definition?.isCustom === true,
  };
}

/**
 * List all known providers along with their auth status and model metadata.
 *
 * Returns every provider derived from the models.dev catalog, plus any
 * built-in overrides (Ollama, DeepSeek) and user-registered custom
 * providers. Auth status is a configuration-level check (env var /
 * credential store presence) and never performs network calls unless
 * `live === true` is passed.
 *
 * @param credentialStore - The credential store used to check auth status.
 * @param options - `scope` for scoped credential resolution; `live` to enable live model discovery.
 *
 * @example
 * ```ts
 * const providers = await listProviders(credentialStore, { live: true });
 * for (const provider of providers) {
 *   console.log(`${provider.name}: ${provider.authStatus} (${provider.models.length} models, ${provider.modelsSource})`);
 * }
 * ```
 */
export async function listProviders(
  credentialStore: CredentialStore,
  options?: { readonly scope?: string; readonly live?: boolean },
): Promise<readonly ProviderInfo[]> {
  const entries = await listAllProviderModels(credentialStore, {
    live: options?.live ?? false,
    ...(options?.scope ? { scope: options.scope } : {}),
  });

  return await Promise.all(
    entries.map(async ({ definition, result }): Promise<ProviderInfo> => {
      const authStatus: AuthStatus = await credentialStore.getAuthStatus(
        definition.id,
        options?.scope,
      );
      return {
        id: definition.id,
        name: definition.name,
        credentialType: definition.credentialType ?? "api",
        authStatus,
        models: result.models,
        modelsSource: result.source,
        ...(result.fetchedAt ? { fetchedAt: result.fetchedAt } : {}),
        ...(result.error ? { error: result.error } : {}),
        isCustom: definition.isCustom === true,
      };
    }),
  );
}

/**
 * Look up normalized metadata for a bare model ID from the catalog.
 *
 * Scans the reverse model index for the first provider that lists the
 * model, then returns the full `ModelInfo` (including capabilities,
 * modalities, cost, context window, etc.). Returns `undefined` if the
 * model is not found in any provider catalog.
 *
 * @example
 * ```ts
 * const info = getModelMetadata("gpt-4o");
 * console.log(info?.capabilities?.reasoning); // true
 * console.log(info?.contextWindow);           // 128000
 * ```
 */
export function getModelMetadata(modelId: string): ModelInfo | undefined {
  const providerIds = getProvidersForModel(modelId);
  for (const providerId of providerIds) {
    const provider = getCatalogProviderSync(providerId);
    if (!provider?.models[modelId]) continue;
    return toModelInfo(provider.models[modelId]);
  }
  return undefined;
}

/**
 * Look up capability flags for a bare model ID.
 *
 * Returns the model's `ModelCapabilities` (tools, reasoning, vision,
 * attachment, structuredOutput) from the catalog. Returns `undefined` if
 * the model is not found in any provider catalog.
 *
 * This is a convenience wrapper around `getModelMetadata()` for the common
 * case of checking what features a model supports at runtime.
 *
 * @example
 * ```ts
 * const caps = getModelCapabilities("gpt-4o");
 * if (caps?.reasoning) {
 *   // use reasoning-related options
 * }
 * ```
 */
export function getModelCapabilities(
  modelId: string,
): ModelCapabilities | undefined {
  return getModelMetadata(modelId)?.capabilities;
}

/**
 * Look up normalized metadata for a bare model ID from the catalog.
 *
 * Scans the reverse model index for the first provider that lists the
 * model, then returns the full `ModelInfo` (including capabilities,
 * modalities, cost, context window, etc.). Returns `undefined` if the
 * model is not found in any provider catalog.
 *
 * @example
 * ```ts
 * const info = getModelMetadata("gpt-4o");
 * console.log(info?.capabilities?.reasoning); // true
 * console.log(info?.contextWindow);           // 128000
 * ```
 */
export function getModelMetadata(modelId: string): ModelInfo | undefined {
  const providerIds = getProvidersForModel(modelId);
  for (const providerId of providerIds) {
    const provider = getCatalogProviderSync(providerId);
    if (!provider?.models[modelId]) continue;
    return toModelInfo(provider.models[modelId]);
  }
  return undefined;
}

/**
 * Look up capability flags for a bare model ID.
 *
 * Returns the model's `ModelCapabilities` (tools, reasoning, vision,
 * attachment, structuredOutput) from the catalog. Returns `undefined` if
 * the model is not found in any provider catalog.
 *
 * This is a convenience wrapper around `getModelMetadata()` for the common
 * case of checking what features a model supports at runtime.
 *
 * @example
 * ```ts
 * const caps = getModelCapabilities("gpt-4o");
 * if (caps?.reasoning) {
 *   // use reasoning-related options
 * }
 * ```
 */
export function getModelCapabilities(
  modelId: string,
): ModelCapabilities | undefined {
  return getModelMetadata(modelId)?.capabilities;
}

/**
 * Convert a provider ID to a human-friendly display name.
 *
 * Hyphen-separated tokens are capitalized (e.g., `github-copilot` ->
 * `Github Copilot`). This is a best-effort default; consumers that want
 * brand-accurate names should rely on the catalog-provided `name`.
 */
export function formatProviderName(providerId: string): string {
  return providerId
    .split("-")
    .map((token) =>
      token.length === 0 ? token : token[0]?.toUpperCase() + token.slice(1),
    )
    .join(" ");
}
