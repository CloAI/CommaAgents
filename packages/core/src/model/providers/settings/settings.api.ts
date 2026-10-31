import type { z } from "zod/v4";
import type { ProviderDefinition } from "../providers.types";
import { getGlobalCredentialStore } from "../../../credentials";
import { getProviderInfo } from "../../model.utils";
import {
  getProviderDefinition,
  listProviderDefinitions,
  synchronizeProviderSettings,
  prepareProviderSettings,
} from "../providers";
import { supportsProviderVerification } from "../verification";
import {
  CustomProviderDefinitionSchema,
  ProviderArgumentsSchema,
  ConfigureProviderArgumentsSchema,
  AddCustomProviderArgumentsSchema,
  UpdateCustomProviderArgumentsSchema,
  CustomProviderModelArgumentsSchema,
  AddCustomProviderModelArgumentsSchema,
} from "./settings.schemas";
import {
  getProviderSettings,
  installProviderSettings,
  providerSettingsError,
  readProviderSettings,
  saveProviderSettings,
  serializeProviderSettings,
} from "./settings";
import type {
  AddCustomProviderOptions,
  UpdateCustomProviderOptions,
  ProviderConfiguration,
  ProviderSettings,
  AddCustomProviderModelOptions,
} from "./settings.types";

/** Validate public options without exposing submitted fields in errors.
 * @param {Schema} schema - Public argument schema.
 * @param {unknown} value - Submitted options.
 * @returns {z.output<Schema>} Validated options.
 */
function parseOptions<Schema extends z.ZodType>(
  schema: Schema,
  value: unknown,
): z.output<Schema> {
  const result = schema.safeParse(value);
  if (!result.success)
    throw providerSettingsError(
      "INVALID_ARGUMENTS",
      "Invalid provider options.",
    );
  return result.data;
}

/** Resolve a known provider, including persisted custom endpoints.
 * @param {string} providerId - Known provider identity.
 * @returns {Promise<ProviderDefinition>} Runtime provider definition.
 */
async function requireProvider(providerId: string) {
  const definition = await getProviderDefinition(providerId);
  if (!definition)
    throw providerSettingsError("NOT_FOUND", "Provider was not found.");
  return definition;
}

/** Commit settings before changing runtime definitions.
 * @param {ProviderSettings} settings - Validated replacement settings.
 * @returns {Promise<void>} Resolves after persistence and runtime synchronization.
 */
async function commit(
  settings: ReturnType<typeof getProviderSettings>,
): Promise<void> {
  prepareProviderSettings(settings);
  await saveProviderSettings(settings);
  synchronizeProviderSettings(settings);
}

/** Read effective configuration without exposing credential values.
 * @param {{providerId: string}} options - Provider identity.
 * @example const configuration = await getProviderConfiguration({ providerId: "openai" });
 * @returns {Promise<ProviderConfiguration>} Secret-free effective configuration.
 */
export async function getProviderConfiguration(options: {
  readonly providerId: string;
}): Promise<ProviderConfiguration> {
  const { providerId } = parseOptions(ProviderArgumentsSchema, options);
  const definition = await requireProvider(providerId);
  const store = getGlobalCredentialStore();
  const entry = getProviderSettings().providers.find(
    (provider) => provider.id === providerId,
  );
  const credential = await store.resolve(providerId);
  return {
    providerId,
    authenticationMethod: credential?.type ?? null,
    ...(credential?.type === "oauth" &&
    typeof credential.metadata?.email === "string"
      ? { accountEmail: credential.metadata.email }
      : {}),
    authStatus: credential ? "configured" : "none",
    hasSavedCredential: (await store.get(providerId, "$global")) !== undefined,
    credentialSource: await store.getSource(providerId),
    verificationSupported:
      credential?.type !== "oauth" &&
      supportsProviderVerification(providerId) &&
      (definition.credentialType ?? "api") === "api",
    customProvider:
      entry?.kind === "custom"
        ? {
            name: entry.definition.name,
            baseURL: entry.definition.baseURL,
            credentialType: entry.definition.credentialType,
          }
        : null,
    customModels: entry?.models ?? [],
  };
}

/** Save or replace a global API key without making a verification request.
 * @param {{providerId: string, apiKey: string}} options - Provider identity and nonempty API key.
 * @example await configureProvider({ providerId: "openai", apiKey: "secret" });
 * @returns {Promise<ProviderConfiguration>} Updated credential and endpoint configuration.
 */
export async function configureProvider(options: {
  readonly providerId: string;
  readonly apiKey: string;
}): Promise<ProviderConfiguration> {
  const { providerId, apiKey } = parseOptions(
    ConfigureProviderArgumentsSchema,
    options,
  );
  const definition = await requireProvider(providerId);
  if ((definition.credentialType ?? "api") !== "api")
    throw providerSettingsError(
      "UNSUPPORTED",
      "This provider does not use API-key configuration.",
    );
  await getGlobalCredentialStore().set(providerId, "$global", {
    type: "api",
    key: apiKey,
  });
  return getProviderConfiguration({ providerId });
}

/** Remove a saved global credential, leaving environment/scoped credentials unchanged.
 * @param {{providerId: string}} options - Provider identity.
 * @example await removeProviderCredential({ providerId: "openai" });
 * @returns {Promise<ProviderConfiguration>} Remaining effective configuration.
 */
export async function removeProviderCredential(options: {
  readonly providerId: string;
}): Promise<ProviderConfiguration> {
  const { providerId } = parseOptions(ProviderArgumentsSchema, options);
  await requireProvider(providerId);
  await getGlobalCredentialStore().remove(providerId, "$global");
  return getProviderConfiguration({ providerId });
}

/** Persist a uniquely named compatible endpoint, without network access.
 * @param {AddCustomProviderOptions} options - Endpoint definition and optional manual model IDs.
 * @example await addCustomProvider({ id:"local", name:"Local", baseURL:"http://localhost:1234/v1", credentialType:"none" });
 * @returns {Promise<ProviderInfo>} Created provider with catalog/manual model data.
 */
export async function addCustomProvider(options: AddCustomProviderOptions) {
  const parsed = parseOptions(AddCustomProviderArgumentsSchema, options);
  const { id, models, ...definition } = parsed;
  const entry = {
    kind: "custom" as const,
    id,
    definition,
    models: models ?? [],
  };
  return mutateProviderSettings(entry.id, (settings, definition) => {
    if (definition)
      throw providerSettingsError(
        "CONFLICT",
        "Provider ID is already defined.",
      );
    settings.providers.push(entry);
  });
}

/** Update the public fields of a user-owned endpoint; its ID remains unchanged.
 * @param {UpdateCustomProviderOptions} options - Provider ID and replacement endpoint fields.
 * @example await updateCustomProvider({providerId:"local",name:"Local server"});
 * @returns {Promise<ProviderInfo>} Updated provider with catalog/manual model data.
 */
export async function updateCustomProvider(
  options: UpdateCustomProviderOptions,
) {
  const { providerId, ...changes } = parseOptions(
    UpdateCustomProviderArgumentsSchema,
    options,
  );
  return mutateProviderSettings(providerId, (settings, definition) => {
    if (!definition)
      throw providerSettingsError("NOT_FOUND", "Provider was not found.");
    const entry = settings.providers.find(
      (provider) => provider.id === providerId,
    );
    if (!entry || entry.kind !== "custom")
      throw providerSettingsError(
        "NOT_USER_DEFINED",
        "Only user-owned provider definitions can be updated.",
      );
    entry.definition = parseOptions(CustomProviderDefinitionSchema, {
      ...entry.definition,
      ...changes,
    });
  });
}

/** Remove a custom definition/models after removing its saved global credential.
 * @param {{providerId: string}} options - User-owned provider identity.
 * @example await removeCustomProvider({providerId:"local"});
 * @returns {Promise<{providerId: string, removed: boolean}>} Whether a custom definition was removed.
 */
export function removeCustomProvider(options: { readonly providerId: string }) {
  return serializeProviderSettings(async () => {
    const { providerId } = parseOptions(ProviderArgumentsSchema, options);
    const definition = await getProviderDefinition(providerId);
    const settings = getProviderSettings();
    const entry = settings.providers.find(
      (entry) => entry.id === providerId && entry.kind === "custom",
    );
    if (!entry) {
      if (definition)
        throw providerSettingsError(
          "NOT_USER_DEFINED",
          "Only user-owned provider definitions can be removed.",
        );
      return { providerId, removed: false };
    }
    await getGlobalCredentialStore().remove(providerId, "$global");
    settings.providers = settings.providers.filter(
      (entry) => entry.id !== providerId,
    );
    try {
      await commit(settings);
    } catch {
      throw providerSettingsError(
        "PROVIDER_REMOVAL_PARTIAL",
        "The global credential was removed, but provider settings could not be removed. Retry removal.",
      );
    }
    return { providerId, removed: true };
  });
}

/** Add a provider-local model ID; repeated additions are idempotent.
 * @param {AddCustomProviderModelOptions} options - Provider/model identity with optional metadata.
 * @example await addCustomProviderModel({providerId:"local",modelId:"org/model"});
 * @returns {Promise<ProviderInfo>} Provider after adding the manual model ID.
 */
export function addCustomProviderModel(options: AddCustomProviderModelOptions) {
  return mutateModel(options, true);
}

/** Remove only the manual model entry, leaving catalog/live membership unchanged.
 * @param {AddCustomProviderModelOptions} options - Provider/model identity with optional metadata.
 * @example await removeCustomProviderModel({providerId:"local",modelId:"org/model"});
 * @returns {Promise<ProviderInfo>} Provider after removing the manual model entry.
 */
export function removeCustomProviderModel(options: {
  readonly providerId: string;
  readonly modelId: string;
}) {
  return mutateModel(
    parseOptions(CustomProviderModelArgumentsSchema, options),
    false,
  );
}

/** Apply an additive model entry without changing independently discovered models.
 * @param {{providerId: string, modelId: string}} options - Provider/model identity.
 * @param {boolean} add - Whether to add rather than remove.
 * @returns {Promise<ProviderInfo>} Updated provider view.
 */
async function mutateModel(
  options: AddCustomProviderModelOptions,
  add: boolean,
) {
  const { providerId, modelId, metadata } = parseOptions(
    AddCustomProviderModelArgumentsSchema,
    options,
  );
  return mutateProviderSettings(providerId, (settings, definition) => {
    if (!definition)
      throw providerSettingsError("NOT_FOUND", "Provider was not found.");
    let entry = settings.providers.find((entry) => entry.id === providerId);
    if ((entry?.models.some((model) => model.id === modelId) ?? false) === add)
      return false;
    if (!entry) {
      entry = { kind: "existing", id: providerId, models: [] };
      settings.providers.push(entry);
    }
    entry.models = add
      ? [...entry.models, { id: modelId, ...(metadata ? { metadata } : {}) }]
      : entry.models.filter((model) => model.id !== modelId);
    if (!entry.models.length && entry.kind !== "custom")
      settings.providers = settings.providers.filter(
        (provider) => provider !== entry,
      );
  });
}

/** Apply a settings edit through the shared serialized persistence path.
 * @param {string} providerId - Provider returned after the edit.
 * @param {(settings: ProviderSettings, definition: ProviderDefinition | undefined) => false | void} change - Edit the settings, or return false for a no-op.
 * @returns {Promise<ProviderInfo>} Effective provider without live discovery.
 */
function mutateProviderSettings(
  providerId: string,
  change: (
    settings: ProviderSettings,
    definition: ProviderDefinition | undefined,
  ) => false | void,
) {
  return serializeProviderSettings(async () => {
    const definition = await getProviderDefinition(providerId);
    const settings = getProviderSettings();
    if (change(settings, definition) !== false) await commit(settings);
    return getProviderInfo(providerId, getGlobalCredentialStore(), {
      live: false,
    });
  });
}

/** Reload externally edited settings; a failed reload preserves active definitions.
 * @example await reloadProviderSettings();
 * @returns {Promise<ProviderSettings>} Validated, installed settings.
 */
export function reloadProviderSettings() {
  return serializeProviderSettings(async () => {
    await listProviderDefinitions();
    const settings = readProviderSettings();
    synchronizeProviderSettings(settings);
    installProviderSettings(settings);
    return getProviderSettings();
  });
}
