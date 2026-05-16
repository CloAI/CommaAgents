import type { LanguageModel } from "ai";
import {
  getGlobalCredentialStore,
  getGlobalProviderResolver,
} from "../defaults/defaults";
import { ModelResolutionError } from "../errors/index";
import { parseModel } from "./model.utils";
import { getProvidersForModel } from "./providers/index";

/** Direct model registrations — maps full model strings to LanguageModel instances. */
let modelRegistry = new Map<string, LanguageModel>();

/**
 * Register a LanguageModel instance for a specific model string.
 *
 * Registered models take precedence over provider-based resolution.
 * This is the simplest way to provide mock models for tests.
 *
 * @param modelString - The full "providerID/modelID" string to register under.
 * @param model - The LanguageModel instance to associate with the string.
 *
 * @example
 * ```ts
 * import { registerModel } from "@comma-agents/core";
 *
 * const mockModel = createSimpleMockModel(["Hello!"]);
 * registerModel("mock/test", mockModel);
 *
 * const agent = createAgent({ name: "test", model: "mock/test" });
 * ```
 */
export function registerModel(modelString: string, model: LanguageModel): void {
  modelRegistry.set(modelString, model);
}

/**
 * Remove a previously registered model.
 *
 * @param modelString - The string originally passed to `registerModel`.
 * @returns `true` if the model was registered and removed.
 */
export function unregisterModel(modelString: string): boolean {
  return modelRegistry.delete(modelString);
}

/** Reset the global model registry to empty state. Primarily for tests. */
export function resetModelRegistry(): void {
  modelRegistry = new Map();
}

/**
 * Resolve a model string into a live LanguageModel instance.
 *
 * Supports two formats:
 * 1. `"providerID/modelID"` — explicit provider selection (e.g. `"openai/gpt-4o"`).
 * 2. Bare model ID — auto-resolves the provider from the models.dev catalog
 *    by finding providers that list the model and have configured credentials.
 *
 * Resolution order:
 * 1. Direct model registry (via `registerModel()`) — exact match on the full string.
 * 2. If the string contains `/`: parse as `providerID/modelID`, resolve credential
 *    for that provider, and instantiate the model.
 * 3. If the string has no `/`: query the reverse model index for candidate providers.
 *    For each candidate (alphabetically sorted), check if a credential is configured.
 *    The first provider with a credential wins. If none have credentials, throw
 *    with a list of candidate providers that support the model.
 *
 * @param modelString - `"providerID/modelID"` or a bare model ID like `"gpt-4o"`.
 * @throws {ModelResolutionError} If the model string cannot be resolved.
 *
 * @example
 * ```ts
 * // Explicit provider
 * const model = await resolveModel("openai/gpt-4o");
 *
 * // Auto-resolved — finds the first provider with credentials for this model
 * const model = await resolveModel("gpt-4o");
 *
 * // With a pre-registered model (e.g., in tests)
 * registerModel("mock/simple", mockLanguageModel);
 * ```
 */
export async function resolveModel(
  modelString: string,
): Promise<LanguageModel> {
  const trimmed = modelString.trim();
  if (trimmed.length === 0) {
    throw new ModelResolutionError(modelString, "Model string cannot be empty");
  }

  const registered = modelRegistry.get(trimmed);
  if (registered) return registered;

  const credentialStore = getGlobalCredentialStore();
  const resolver = getGlobalProviderResolver();

  if (trimmed.includes("/")) {
    return await resolveExplicitModel(trimmed, credentialStore, resolver);
  }

  return await resolveAutoModel(trimmed, credentialStore, resolver);
}

async function resolveExplicitModel(
  modelString: string,
  credentialStore: ReturnType<typeof getGlobalCredentialStore>,
  resolver: ReturnType<typeof getGlobalProviderResolver>,
): Promise<LanguageModel> {
  const parsed = parseModel(modelString);

  const credential = await credentialStore.resolve(parsed.providerId);
  if (!credential) {
    throw new ModelResolutionError(
      modelString,
      `No credential found for provider "${parsed.providerId}". ` +
        "Register the model directly with registerModel(), register a provider with " +
        "registerProvider(), or configure credentials via the credential store.",
    );
  }

  try {
    const factory = await resolver(parsed.providerId, credential);
    return factory(parsed.modelId);
  } catch (resolverError) {
    const detail =
      resolverError instanceof Error
        ? resolverError.message
        : String(resolverError);
    throw new ModelResolutionError(
      modelString,
      `Provider resolution failed for "${parsed.providerId}": ${detail}`,
      { cause: resolverError },
    );
  }
}

async function resolveAutoModel(
  modelId: string,
  credentialStore: ReturnType<typeof getGlobalCredentialStore>,
  resolver: ReturnType<typeof getGlobalProviderResolver>,
): Promise<LanguageModel> {
  const candidateProviders = getProvidersForModel(modelId);

  if (candidateProviders.length === 0) {
    throw new ModelResolutionError(
      modelId,
      `Model "${modelId}" is not listed by any known provider in the catalog. ` +
        "Use the \"providerID/modelID\" format to specify a provider explicitly.",
    );
  }

  // TODO: when priority settings are implemented, sort candidateProviders
  // by user-defined provider preference/weighting here instead of relying
  // on the alphabetical sort from the reverse index.

  for (const providerId of candidateProviders) {
    const credential = await credentialStore.resolve(providerId);
    if (!credential) continue;

    try {
      const factory = await resolver(providerId, credential);
      return factory(modelId);
    } catch {
      // Try the next candidate — resolution may fail (e.g. package not installed)
      continue;
    }
  }

  const providerList = candidateProviders.join(", ");
  throw new ModelResolutionError(
    modelId,
    `Model "${modelId}" is available from [${providerList}], but ` +
      "no credentials are configured for any of these providers. " +
      "Set an environment variable or save credentials via the credential store.",
  );
}

/**
 * Remove a previously registered model.
 *
 * @param modelString - The string originally passed to `registerModel`.
 * @returns `true` if the model was registered and removed.
 */
export function unregisterModel(modelString: string): boolean {
  return modelRegistry.delete(modelString);
}

/** Reset the global model registry to empty state. Primarily for tests. */
export function resetModelRegistry(): void {
  modelRegistry = new Map();
}

/**
 * Resolve a model string into a live LanguageModel instance.
 *
 * Supports two formats:
 * 1. `"providerID/modelID"` — explicit provider selection (e.g. `"openai/gpt-4o"`).
 * 2. Bare model ID — auto-resolves the provider from the models.dev catalog
 *    by finding providers that list the model and have configured credentials.
 *
 * Resolution order:
 * 1. Direct model registry (via `registerModel()`) — exact match on the full string.
 * 2. If the string contains `/`: parse as `providerID/modelID`, resolve credential
 *    for that provider, and instantiate the model.
 * 3. If the string has no `/`: query the reverse model index for candidate providers.
 *    For each candidate (alphabetically sorted), check if a credential is configured.
 *    The first provider with a credential wins. If none have credentials, throw
 *    with a list of candidate providers that support the model.
 *
 * @param modelString - `"providerID/modelID"` or a bare model ID like `"gpt-4o"`.
 * @throws {ModelResolutionError} If the model string cannot be resolved.
 *
 * @example
 * ```ts
 * // Explicit provider
 * const model = await resolveModel("openai/gpt-4o");
 *
 * // Auto-resolved — finds the first provider with credentials for this model
 * const model = await resolveModel("gpt-4o");
 *
 * // With a pre-registered model (e.g., in tests)
 * registerModel("mock/simple", mockLanguageModel);
 * ```
 */
export async function resolveModel(
  modelString: string,
): Promise<LanguageModel> {
  const trimmed = modelString.trim();
  if (trimmed.length === 0) {
    throw new ModelResolutionError(modelString, "Model string cannot be empty");
  }

  const registered = modelRegistry.get(trimmed);
  if (registered) return registered;

  const credentialStore = getGlobalCredentialStore();
  const resolver = getGlobalProviderResolver();

  if (trimmed.includes("/")) {
    return await resolveExplicitModel(trimmed, credentialStore, resolver);
  }

  return await resolveAutoModel(trimmed, credentialStore, resolver);
}

async function resolveExplicitModel(
  modelString: string,
  credentialStore: ReturnType<typeof getGlobalCredentialStore>,
  resolver: ReturnType<typeof getGlobalProviderResolver>,
): Promise<LanguageModel> {
  const parsed = parseModel(modelString);

  const credential = await credentialStore.resolve(parsed.providerId);
  if (!credential) {
    throw new ModelResolutionError(
      modelString,
      `No credential found for provider "${parsed.providerId}". ` +
        "Register the model directly with registerModel(), register a provider with " +
        "registerProvider(), or configure credentials via the credential store.",
    );
  }

  try {
    const factory = await resolver(parsed.providerId, credential);
    return factory(parsed.modelId);
  } catch (resolverError) {
    const detail =
      resolverError instanceof Error
        ? resolverError.message
        : String(resolverError);
    throw new ModelResolutionError(
      modelString,
      `Provider resolution failed for "${parsed.providerId}": ${detail}`,
      { cause: resolverError },
    );
  }
}

async function resolveAutoModel(
  modelId: string,
  credentialStore: ReturnType<typeof getGlobalCredentialStore>,
  resolver: ReturnType<typeof getGlobalProviderResolver>,
): Promise<LanguageModel> {
  const candidateProviders = getProvidersForModel(modelId);

  if (candidateProviders.length === 0) {
    throw new ModelResolutionError(
      modelId,
      `Model "${modelId}" is not listed by any known provider in the catalog. ` +
        "Use the \"providerID/modelID\" format to specify a provider explicitly.",
    );
  }

  // TODO: when priority settings are implemented, sort candidateProviders
  // by user-defined provider preference/weighting here instead of relying
  // on the alphabetical sort from the reverse index.

  for (const providerId of candidateProviders) {
    const credential = await credentialStore.resolve(providerId);
    if (!credential) continue;

    try {
      const factory = await resolver(providerId, credential);
      return factory(modelId);
    } catch {
      // Try the next candidate — resolution may fail (e.g. package not installed)
      continue;
    }
  }

  const providerList = candidateProviders.join(", ");
  throw new ModelResolutionError(
    modelId,
    `Model "${modelId}" is available from [${providerList}], but ` +
      "no credentials are configured for any of these providers. " +
      "Set an environment variable or save credentials via the credential store.",
  );
}
