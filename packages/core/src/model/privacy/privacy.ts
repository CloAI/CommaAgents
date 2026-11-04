import { createProtectedModelResolver } from "../providers/protected/protected";
import { DEFAULT_PRIVACY_LIMITS } from "./privacy.constants";
import { PrivacyRequirementsSchema } from "./privacy.schemas";
import type { PrivacyRuntime, PrivacyRuntimeOptions } from "./privacy.types";
import { assertPrivacyActive, privacyError } from "./privacy.utils";

/**
 * Create an application-owned runtime for independently verified inference.
 * @param {PrivacyRuntimeOptions} options - Provider verification settings, resource limits, and content-free observer.
 * @returns {PrivacyRuntime} Protected model resolver without persistent session keys.
 * @example const privacyRuntime = createPrivacyRuntime();
 */
export function createPrivacyRuntime(
  options: PrivacyRuntimeOptions = {},
): PrivacyRuntime {
  const limits = Object.freeze({
    ...DEFAULT_PRIVACY_LIMITS,
    ...options.limits,
  });
  if (
    Object.values(limits).some(
      (value) =>
        !Number.isSafeInteger(value) || value <= 0 || value > 2_147_483_647,
    )
  ) {
    throw privacyError("PRIVACY_CONFIGURATION_ERROR");
  }
  const resolveProtectedModel = createProtectedModelResolver(options, limits);
  return {
    async resolveModel(modelString, requirements, resolution = {}) {
      if (resolution.signal) {
        assertPrivacyActive(resolution.signal);
      }
      const parsed = PrivacyRequirementsSchema.safeParse(requirements);
      if (!parsed.success || parsed.data.tee !== "required") {
        throw privacyError("PRIVACY_CONFIGURATION_ERROR");
      }
      return resolveProtectedModel(
        modelString,
        Object.freeze({ ...parsed.data }),
        resolution,
      );
    },
  };
}
