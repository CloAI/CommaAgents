import type {
  DiscoveredProvider,
  ProviderStatus,
  ProviderVerification,
} from "./ProviderModels.types";

/** Verification results that are not problems in themselves. */
const QUIET_VERIFICATIONS: readonly ProviderVerification["status"][] = [
  "verified",
  "unsupported",
  "unconfigured",
];

/**
 * Describe a provider's connection from its credentials and latest check.
 * @param {DiscoveredProvider} provider - Provider to describe.
 * @param {ProviderVerification | undefined} verification - Latest explicit check in this view.
 * @returns {ProviderStatus} Labels and indicator for the provider heading.
 */
export function providerStatus(
  provider: DiscoveredProvider,
  verification: ProviderVerification | undefined,
): ProviderStatus {
  const isConnected =
    provider.authStatus === "configured" || provider.credentialType === "none";
  const isVerified = verification?.status === "verified";
  const verificationIssue =
    verification && !QUIET_VERIFICATIONS.includes(verification.status)
      ? verification.status
      : undefined;
  const connectionLabel = isVerified
    ? "Verified"
    : isConnected
      ? "Connected"
      : "Needs credentials";
  return {
    actionLabel: isConnected ? "Configure" : "Connect",
    connectionLabel,
    indicator: verificationIssue
      ? "warning"
      : isConnected
        ? "configured"
        : "unconfigured",
    description: [
      `${provider.name}: ${connectionLabel}.`,
      isVerified
        ? "Authenticated model-list check passed."
        : "Configuration status; access not verified.",
      verificationIssue && `Verification: ${verificationIssue}.`,
    ]
      .filter(Boolean)
      .join(" "),
  };
}
