import type { LanguageModel } from "ai";
import { getGlobalCredentialStore } from "../../../credentials";
import type {
  PrivacyLimits,
  PrivacyRuntime,
  PrivacyRuntimeOptions,
} from "../../privacy/privacy.types";
import { privacyError, assertPrivacyActive } from "../../privacy/privacy.utils";
import { getProviderDefinition } from "../providers";
import { validateTinfoilPolicy } from "../tinfoil/verification/verification";
import { createTinfoilProtectedModel } from "../tinfoil/tinfoil";
import { createVeniceProtectedModel } from "../venice/venice";
import { resolveVenicePrivacyOptions } from "../venice/venice.privacy";
import type { ProtectedModelOptions } from "./protected.types";

/** Resolve only built-in protected transports; ordinary provider overrides cannot replace them.
 * @param {PrivacyRuntimeOptions} options - Application-owned verification configuration.
 * @param {PrivacyLimits} limits - Validated resource limits for every protected request.
 * @returns {PrivacyRuntime["resolveModel"]} Resolver using only code-owned protected transports.
 */
export function createProtectedModelResolver(
  options: PrivacyRuntimeOptions,
  limits: PrivacyLimits,
): PrivacyRuntime["resolveModel"] {
  if (
    options.providers !== undefined &&
    (options.providers === null ||
      typeof options.providers !== "object" ||
      Array.isArray(options.providers) ||
      Object.keys(options.providers).some(
        (providerId) => providerId !== "venice" && providerId !== "tinfoil",
      ))
  ) {
    throw privacyError("PRIVACY_CONFIGURATION_ERROR");
  }
  const venice = resolveVenicePrivacyOptions(
    options.providers?.venice,
    options,
  );
  const tinfoilOptions =
    options.providers?.tinfoil === undefined ? {} : options.providers.tinfoil;
  validateTinfoilPolicy(tinfoilOptions);
  const tinfoil = Object.freeze({
    ...tinfoilOptions,
    ...(tinfoilOptions.pinnedRegisters
      ? {
          pinnedRegisters: Object.freeze({ ...tinfoilOptions.pinnedRegisters }),
        }
      : {}),
  });
  const factories = new Map<
    string,
    (options: ProtectedModelOptions) => LanguageModel
  >([
    [
      "tinfoil",
      (modelOptions) =>
        createTinfoilProtectedModel({
          ...modelOptions,
          ...tinfoil,
        }),
    ],
    [
      "venice",
      (modelOptions) =>
        createVeniceProtectedModel({ ...modelOptions, ...venice }),
    ],
  ]);

  return async (modelString, requirements, resolution = {}) => {
    const separator = modelString.indexOf("/");
    const providerId =
      separator === -1 ? modelString : modelString.slice(0, separator);
    const modelId = separator === -1 ? "" : modelString.slice(separator + 1);
    const factory = factories.get(providerId);
    if (!factory) {
      throw privacyError("PRIVACY_UNSUPPORTED_PROVIDER");
    }
    if (!modelId || /[\s/]/.test(modelId)) {
      throw privacyError("PRIVACY_CONFIGURATION_ERROR");
    }
    const definition = await getProviderDefinition(providerId);
    if (definition?.origin === "registered" || definition?.origin === "user") {
      throw privacyError("PRIVACY_UNSUPPORTED_PROVIDER");
    }
    if (resolution.signal) {
      assertPrivacyActive(resolution.signal);
    }
    const credential = await getGlobalCredentialStore().resolve(providerId);
    if (resolution.signal) {
      assertPrivacyActive(resolution.signal);
    }
    if (credential?.type !== "api" || !credential.key) {
      throw privacyError("PRIVACY_CREDENTIAL_REQUIRED");
    }
    return factory({
      modelId,
      apiKey: credential.key,
      requirements,
      limits,
      ...resolution,
      onEvent: options.onEvent,
    });
  };
}
