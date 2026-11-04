import type { LanguageModel } from "ai";
import { PrivacyRequirementsSchema } from "./privacy/privacy.schemas";
import { privacyError } from "./privacy/privacy.utils";
import type { ModelResolutionOptions, ResolvedModel } from "./model.types";
import { getGlobalCredentialStore } from "../credentials";
import { ModelResolutionError } from "../errors/index";
import { createPrivacyRuntime } from "./privacy/privacy";
import { getModelPrivacyRequirements, parseModel } from "./model.utils";
import {
  getGlobalProviderResolver,
  getProviderDefinition,
  getProvidersForModel,
} from "./providers/index";

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
 * @param {string} modelString - `"providerID/modelID"` or a bare model ID like `"gpt-4o"`.
 * @param {ModelResolutionOptions} [options] - Required privacy protections and trusted runtime services.
 * @returns {Promise<LanguageModel>} Model with any required protections enforced before inference.
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
  options?: ModelResolutionOptions,
): Promise<LanguageModel> {
  return (await resolveModelWithPrivacy(modelString, options)).model;
}

/**
 * Resolve a model together with protections inherited by related requests.
 * @param {string} modelString - Qualified or bare model identity.
 * @param {ModelResolutionOptions} [options] - Minimum protections and runtime services.
 * @returns {Promise<ResolvedModel>} Selected model and effective protection policy.
 * @internal
 */
export async function resolveModelWithPrivacy(
  modelString: string,
  options?: ModelResolutionOptions,
): Promise<ResolvedModel> {
  const trimmed = modelString.trim();
  if (trimmed.length === 0) {
    throw new ModelResolutionError(modelString, "Model string cannot be empty");
  }

  const requirements = PrivacyRequirementsSchema.safeParse(
    options?.privacy === undefined ? {} : options.privacy,
  );
  if (!requirements.success) {
    throw privacyError("PRIVACY_CONFIGURATION_ERROR");
  }
  const automaticPrivacy = getModelPrivacyRequirements(trimmed);
  const effectivePrivacy = { ...requirements.data, ...automaticPrivacy };
  if (effectivePrivacy.tee || effectivePrivacy.e2ee) {
    if (!trimmed.includes("/")) {
      throw privacyError("PRIVACY_CONFIGURATION_ERROR");
    }
    const privacyRuntime =
      options?.privacyRuntime ??
      (automaticPrivacy?.tee ? createPrivacyRuntime() : undefined);
    if (!privacyRuntime) {
      throw privacyError("PRIVACY_CONFIGURATION_ERROR");
    }
    if (options?.signal?.aborted) {
      throw privacyError("PRIVACY_CANCELLED");
    }
    return {
      model: await privacyRuntime.resolveModel(trimmed, effectivePrivacy, {
        signal: options?.signal,
        onReport: options?.onPrivacyReport,
      }),
      privacy: effectivePrivacy,
      privacyRuntime,
    };
  }

  const registered = modelRegistry.get(trimmed);
  if (registered) {
    return { model: registered };
  }

  const credentialStore = getGlobalCredentialStore();
  const resolver = getGlobalProviderResolver();

  if (trimmed.includes("/")) {
    return {
      model: await resolveExplicitModel(trimmed, credentialStore, resolver),
    };
  }

  return await resolveAutoModel(trimmed, credentialStore, resolver, options);
}

async function resolveExplicitModel(
  modelString: string,
  credentialStore: ReturnType<typeof getGlobalCredentialStore>,
  resolver: ReturnType<typeof getGlobalProviderResolver>,
): Promise<LanguageModel> {
  const parsed = parseModel(modelString);

  const definition = await getProviderDefinition(parsed.providerId);
  const credential =
    definition?.credentialType === "none"
      ? { type: "custom" as const, data: {} }
      : await credentialStore.resolve(parsed.providerId);
  if (!credential) {
    throw new ModelResolutionError(
      modelString,
      `No credential found for provider "${parsed.providerId}". ` +
        "Register the model directly with registerModel(), register a provider with " +
        "registerProviderDefinition(), or configure credentials via the credential store.",
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
  options?: ModelResolutionOptions,
): Promise<ResolvedModel> {
  // TODO: Decide whether user-configured model IDs should participate in bare-ID provider selection.
  const candidateProviders = getProvidersForModel(modelId);

  if (candidateProviders.length === 0) {
    throw new ModelResolutionError(
      modelId,
      `Model "${modelId}" is not listed by any known provider in the catalog. ` +
        'Use the "providerID/modelID" format to specify a provider explicitly.',
    );
  }

  // TODO: when priority settings are implemented, sort candidateProviders
  // by user-defined provider preference/weighting here instead of relying
  // on the alphabetical sort from the reverse index.

  for (const providerId of candidateProviders) {
    const credential = await credentialStore.resolve(providerId);
    if (!credential) {
      continue;
    }

    // Once a protected provider is selected, failure must not downgrade to another provider.
    const qualifiedModel = `${providerId}/${modelId}`;
    if (getModelPrivacyRequirements(qualifiedModel)?.tee) {
      return resolveModelWithPrivacy(qualifiedModel, options);
    }

    try {
      const factory = await resolver(providerId, credential);
      return { model: factory(modelId) };
    } catch {}
  }

  const providerList = candidateProviders.join(", ");
  throw new ModelResolutionError(
    modelId,
    `Model "${modelId}" is available from [${providerList}], but ` +
      "no credentials are configured for any of these providers. " +
      "Set an environment variable or save credentials via the credential store.",
  );
}
