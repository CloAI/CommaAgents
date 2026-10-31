import { getGlobalCredentialStore } from "../../credentials";
import { getProviderDefinition } from "../providers/providers";
import { createVeniceProtectedModel } from "../providers/venice/venice";
import {
  DEFAULT_NRAS_URL,
  DEFAULT_PCCS_URL,
  DEFAULT_PRIVACY_LIMITS,
} from "./privacy.constants";
import { PrivacyRequirementsSchema } from "./privacy.schemas";
import type { PrivacyRuntime, PrivacyRuntimeOptions } from "./privacy.types";
import { privacyError, sanitizePrivacyError } from "./privacy.utils";

/**
 * Create an application-owned runtime for independently verified inference.
 * @param {PrivacyRuntimeOptions} options - Trusted services, resource limits, and content-free observer.
 * @returns {PrivacyRuntime} Protected model resolver without persistent session keys.
 * @example const privacyRuntime = createPrivacyRuntime();
 */
export function createPrivacyRuntime(
  options: PrivacyRuntimeOptions = {},
): PrivacyRuntime {
  const limits = { ...DEFAULT_PRIVACY_LIMITS, ...options.limits };
  if (
    Object.values(limits).some(
      (value) =>
        !Number.isSafeInteger(value) || value <= 0 || value > 2_147_483_647,
    )
  )
    throw privacyError("PRIVACY_CONFIGURATION_ERROR");
  const pccsURL = options.pccsURL ?? DEFAULT_PCCS_URL;
  const nrasURL = options.nrasURL ?? DEFAULT_NRAS_URL;
  for (const endpoint of [pccsURL, nrasURL]) {
    let parsed: URL;
    try {
      parsed = new URL(endpoint);
    } catch {
      throw privacyError("PRIVACY_CONFIGURATION_ERROR");
    }
    if (
      parsed.protocol !== "https:" ||
      parsed.username ||
      parsed.password ||
      parsed.search ||
      parsed.hash
    )
      throw privacyError("PRIVACY_CONFIGURATION_ERROR");
  }
  return {
    async resolveModel(modelString, requirements, resolution = {}) {
      if (resolution.signal?.aborted)
        throw sanitizePrivacyError(undefined, resolution.signal);
      const parsed = PrivacyRequirementsSchema.safeParse(requirements);
      if (
        !parsed.success ||
        parsed.data.tee !== "required" ||
        !/^venice\/[^/\s]+$/.test(modelString)
      )
        throw privacyError(
          modelString.startsWith("venice/")
            ? "PRIVACY_CONFIGURATION_ERROR"
            : "PRIVACY_UNSUPPORTED_PROVIDER",
        );
      const definition = await getProviderDefinition("venice");
      if (definition?.origin === "registered" || definition?.origin === "user")
        throw privacyError("PRIVACY_UNSUPPORTED_PROVIDER");
      const credential = await getGlobalCredentialStore().resolve("venice");
      if (credential?.type !== "api" || !credential.key)
        throw privacyError("PRIVACY_CREDENTIAL_REQUIRED");
      return createVeniceProtectedModel({
        modelId: modelString.slice("venice/".length),
        apiKey: credential.key,
        requirements: Object.freeze({ ...parsed.data }),
        limits: Object.freeze({ ...limits }),
        pccsURL,
        nrasURL,
        ...resolution,
        onEvent: options.onEvent,
      });
    },
  };
}
