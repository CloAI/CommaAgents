import type { ProviderVerification } from "./ProviderConfigurationDialog.types";

/** Extract safe daemon/client messages without printing submitted arguments.
 * @param {unknown} error - Daemon or client error.
 * @returns {string} Public explanation.
 */
export function providerErrorMessage(error: unknown): string {
  return typeof error === "object" &&
    error !== null &&
    "message" in error &&
    typeof error.message === "string"
    ? error.message
    : "The operation could not be completed.";
}

/** Describe the non-success outcome without presenting saved credentials as invalid by default.
 * @param {ProviderVerification["status"]} status - Verification outcome.
 * @returns {string} User-facing explanation.
 */
export function verificationMessage(
  status: ProviderVerification["status"],
): string {
  switch (status) {
    case "invalid_credentials":
      return "The provider rejected the API key.";
    case "access_denied":
      return "The provider denied access for this key.";
    case "rate_limited":
      return "The provider rate limited the verification request.";
    case "timeout":
      return "The verification request timed out.";
    case "invalid_response":
      return "The provider returned an unexpected verification response.";
    case "unconfigured":
      return "No effective credential was available for verification.";
    case "unavailable":
      return "The provider could not be reached for verification.";
    case "unsupported":
      return "Saved. Verification is not available for this provider.";
    case "verified":
      return "Verified";
  }
}
