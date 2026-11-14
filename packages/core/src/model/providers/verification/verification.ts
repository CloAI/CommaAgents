import { VerifyProviderArgumentsSchema } from "./verification.schemas";
import { getGlobalCredentialStore } from "../../../credentials/global-credential-store";
import { getProviderDefinition } from "../providers";
import { createOpenAIVerificationRequest } from "./openai";
import { createAnthropicVerificationRequest } from "./anthropic";
import { createGoogleVerificationRequest } from "./google";
import type {
  ProviderVerificationResult,
  ProviderVerificationStatus,
  VerifyProviderArguments,
  VerifyProviderOptions,
} from "./verification.types";

const verificationRequests = {
  openai: createOpenAIVerificationRequest,
  anthropic: createAnthropicVerificationRequest,
  google: createGoogleVerificationRequest,
};

/**
 * Report whether a fixed non-generation check exists for this provider ID.
 * @param {string} providerId - Canonical provider identifier.
 * @returns {boolean} Whether a provider-specific check is available.
 * @example
 * supportsProviderVerification("openai"); // true
 */
export function supportsProviderVerification(providerId: string): boolean {
  return Object.hasOwn(verificationRequests, providerId);
}

/**
 * Check effective API credentials once through an authenticated model-list endpoint.
 * This never generates text, persists a result, retries, or follows redirects.
 * @param {VerifyProviderArguments} argumentsValue - Known provider to check.
 * @param {string} argumentsValue.providerId - Canonical provider identifier.
 * @param {VerifyProviderOptions} options - Optional cancellation owned by the application.
 * @param {AbortSignal} [options.signal] - Owning application's cancellation signal.
 * @returns {Promise<ProviderVerificationResult>} Safe result of this check only.
 * @example
 * const result = await verifyProvider({ providerId: "openai" });
 */
export async function verifyProvider(
  argumentsValue: VerifyProviderArguments,
  { signal }: VerifyProviderOptions = {},
): Promise<ProviderVerificationResult> {
  const parsed = VerifyProviderArgumentsSchema.safeParse(argumentsValue);
  if (!parsed.success) {
    throw Object.assign(new Error("A canonical provider ID is required."), {
      code: "INVALID_ARGUMENTS",
    });
  }
  const { providerId } = parsed.data;
  const definition = await getProviderDefinition(providerId);
  if (!definition) {
    throw Object.assign(new Error("Provider was not found."), {
      code: "NOT_FOUND",
    });
  }
  const result = (
    status: ProviderVerificationStatus,
  ): ProviderVerificationResult => ({
    providerId,
    status,
    checkedAt: new Date().toISOString(),
  });
  if (
    !supportsProviderVerification(providerId) ||
    (definition.credentialType ?? "api") !== "api"
  ) {
    return result("unsupported");
  }

  const credential = await getGlobalCredentialStore().resolve(providerId);
  if (!credential) {
    return result("unconfigured");
  }
  if (credential.type !== "api") {
    return result("unsupported");
  }
  if (signal?.aborted) {
    return result("unavailable");
  }

  const request = verificationRequests[
    providerId as keyof typeof verificationRequests
  ](credential.key);
  const controller = new AbortController();
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, 5_000);
  try {
    const response = await fetch(request.url, {
      method: "GET",
      headers: request.headers,
      redirect: "error",
      signal: signal
        ? AbortSignal.any([controller.signal, signal])
        : controller.signal,
    });
    if (request.invalidCredentialStatuses.includes(response.status)) {
      return result("invalid_credentials");
    }
    if (response.status === 403) {
      return result("access_denied");
    }
    if (response.status === 429) {
      return result("rate_limited");
    }
    if (response.status >= 500) {
      return result("unavailable");
    }
    if (!response.ok) {
      return result("invalid_response");
    }
    const payload: unknown = await response.json();
    return result(
      request.acceptsResponse(payload) ? "verified" : "invalid_response",
    );
  } catch (requestError) {
    return result(
      timedOut
        ? "timeout"
        : signal?.aborted
          ? "unavailable"
          : requestError instanceof SyntaxError
            ? "invalid_response"
            : "unavailable",
    );
  } finally {
    clearTimeout(timeout);
    controller.abort();
  }
}
