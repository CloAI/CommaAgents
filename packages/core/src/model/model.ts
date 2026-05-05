import type { LanguageModel } from "ai";
import { getGlobalCredentialStore, getGlobalProviderResolver } from "../defaults/defaults";
import { ModelResolutionError } from "../errors/index";
import { parseModel } from "./model.utils";

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
 * Resolve a "providerID/modelID" string into a live LanguageModel instance.
 *
 * Resolution order:
 * 1. Direct model registry (via `registerModel()`) — exact match on the full string.
 * 2. Provider-based resolution — parses the string, looks up the provider via
 *    `getGlobalProviderResolver()` (which checks `registerProvider()` first,
 *    then known providers, then guesses `@ai-sdk/<id>`), resolves credentials
 *    via `getGlobalCredentialStore()`, and creates the LanguageModel.
 *
 * @param modelString - The full "providerID/modelID" string to resolve.
 * @throws {ModelResolutionError} If the model string is invalid or no provider can be found.
 *
 * @example
 * ```ts
 * // Assumes "openai" credentials are configured or @ai-sdk/openai is installed
 * const model = await resolveModel("openai/gpt-4o");
 *
 * // With a pre-registered model (e.g., in tests)
 * registerModel("mock/simple", mockLanguageModel);
 * const model = await resolveModel("mock/simple");
 * ```
 */
export async function resolveModel(modelString: string): Promise<LanguageModel> {
  const registered = modelRegistry.get(modelString);
  if (registered) return registered;

  const parsed = parseModel(modelString);
  const credentialStore = getGlobalCredentialStore();
  const resolver = getGlobalProviderResolver();

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
    const detail = resolverError instanceof Error ? resolverError.message : String(resolverError);
    throw new ModelResolutionError(
      modelString,
      `Provider resolution failed for "${parsed.providerId}": ${detail}`,
      { cause: resolverError },
    );
  }
}
