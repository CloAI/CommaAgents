import type { PrivacyRequirements } from "./privacy/privacy.types";
import { listProviderModelsSync } from "./providers/providers";
import type { CredentialStore } from "../credentials/credentials.types";
import { ModelResolutionError } from "../errors/index";
import type { ParsedModel, ProviderInfo } from "./model.types";
import {
  getCatalogProviderSync,
  getProviderDefinition,
  getProviderPackageNameSync,
  getProvidersForModel,
  isKnownProviderSync,
  listProviderDefinitions,
  listProviderModels,
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
  if (!agents) {
    return providerIds;
  }

  for (const agentDefinition of Object.values(agents)) {
    const model = agentDefinition.model;
    if (typeof model !== "string") {
      continue;
    }
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
 * Models come from the models.dev catalog, the provider's last listing from
 * `refreshProviderModels()`, and manual entries. Never makes a network request;
 * auth status is a configuration-level check only.
 *
 * @param providerId - The provider ID to inspect.
 * @param credentialStore - The credential store used to check auth status.
 *
 * @example
 * ```ts
 * const info = await getProviderInfo("openai", credentialStore);
 * // => { id: "openai", name: "OpenAI", authStatus: "configured", models: [...], origin: "builtin" }
 * ```
 */
export async function getProviderInfo(
  providerId: string,
  credentialStore: CredentialStore,
): Promise<ProviderInfo> {
  const definition = await getProviderDefinition(providerId);
  return {
    id: providerId,
    name: definition?.name ?? formatProviderName(providerId),
    credentialType: definition?.credentialType ?? "api",
    authStatus: await credentialStore.getAuthStatus(providerId),
    models: await listProviderModels(providerId),
    origin: definition?.origin ?? "catalog",
  };
}

/**
 * List all known providers along with their auth status and model metadata.
 *
 * Returns every provider derived from the models.dev catalog, plus any
 * built-in overrides (Ollama, DeepSeek) and user-registered custom
 * providers. Never makes a network request; call `refreshProviderModels()`
 * to update provider-listed models.
 *
 * @param credentialStore - The credential store used to check auth status.
 *
 * @example
 * ```ts
 * await refreshProviderModels(credentialStore);
 * const providers = await listProviders(credentialStore);
 * for (const provider of providers) {
 *   console.log(`${provider.name}: ${provider.authStatus} (${provider.models.length} models)`);
 * }
 * ```
 */
export async function listProviders(
  credentialStore: CredentialStore,
): Promise<readonly ProviderInfo[]> {
  const definitions = await listProviderDefinitions();
  return Promise.all(
    definitions.map(({ id }) => getProviderInfo(id, credentialStore)),
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
 * console.log(info?.metadata.capabilities?.reasoning); // true
 * console.log(info?.metadata.contextWindow);           // 128000
 * ```
 */
export function getModelMetadata(modelId: string): ModelInfo | undefined {
  const providerIds = getProvidersForModel(modelId);
  for (const providerId of providerIds) {
    const provider = getCatalogProviderSync(providerId);
    if (!provider?.models[modelId]) {
      continue;
    }
    return toModelInfo(provider.models[modelId]);
  }
  return undefined;
}

/**
 * Look up merged catalog, provider-listed, and manual metadata for a provider-qualified model string.
 *
 * @param model - Model identifier in "providerID/modelID" format.
 * @example
 * ```ts
 * const info = getQualifiedModelMetadata("openai/gpt-4o");
 * console.log(info?.metadata.contextWindow);
 * ```
 */
export function getQualifiedModelMetadata(
  model: string,
): ModelInfo | undefined {
  try {
    const { providerId, modelId } = parseModel(model);
    return listProviderModelsSync(providerId).find(
      (model) => model.id === modelId,
    );
  } catch {
    return undefined;
  }
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
  return getModelMetadata(modelId)?.metadata.capabilities;
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

/**
 * Derive required protections from the model’s advertised capabilities.
 * @param {string} model - Provider-qualified model identity.
 * @returns {PrivacyRequirements | undefined} Advertised requirements, including TEE for E2EE.
 * @internal
 */
export function getModelPrivacyRequirements(
  model: string,
): PrivacyRequirements | undefined {
  if (model.startsWith("tinfoil/")) {
    return { tee: "required", e2ee: "required" };
  }
  const capabilities = getQualifiedModelMetadata(model)?.metadata.capabilities;
  if (capabilities?.e2ee === true) {
    return { tee: "required", e2ee: "required" };
  }
  if (capabilities?.teeAttestation === true) {
    return { tee: "required" };
  }
  return undefined;
}
