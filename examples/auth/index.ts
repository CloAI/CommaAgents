/**
 * Auth module — credential management for comma-agents examples.
 *
 * Wraps @comma-agents/core's credential store with OAuth refresh logic
 * for GitHub Copilot tokens.
 *
 * @example
 * ```ts
 * import { resolveCredential, store } from "../auth";
 *
 * // Get a usable token for any provider (checks env, then store, refreshes if needed)
 * const key = await resolveCredential("openai");
 *
 * // Directly access the store
 * await store.set("openai", { type: "api", key: "sk-..." });
 * const credential = await store.get("openai");
 * ```
 */

import type { OAuthCredential } from "@comma-agents/core";
import { isExpired, isRefreshExpired, refreshAccessToken } from "./copilot";
import * as store from "./store";

// Re-exports

export { store };
export type { DeviceCodeResponse, PollResult } from "./copilot";
export {
  isExpired,
  isRefreshExpired,
  refreshAccessToken,
  startDeviceFlow,
} from "./copilot";
export type { ApiCredential, Credential, OAuthCredential } from "./store";

// High-level credential resolution

/**
 * Resolve a usable API key / token for a provider.
 *
 * Resolution order (via core's credential store):
 *   1. Strategy-scoped credential (if scope provided)
 *   2. Environment variable (standard name(s) from WELL_KNOWN_ENV_VARS)
 *   3. Global-scoped credential
 *
 * For OAuth credentials (e.g. GitHub Copilot), checks expiry and
 * refreshes the access token if needed, persisting the refreshed token
 * back to the store.
 *
 * Returns a plain string (API key or access token), or `undefined`
 * if no credential is available.
 */
export async function resolveCredential(
  providerID: string,
): Promise<string | undefined> {
  const credential = await store.resolve(providerID);
  if (!credential) return undefined;

  // API key — return directly
  if (credential.type === "api") {
    return credential.key;
  }

  // OAuth token — may need refresh
  if (credential.type === "oauth") {
    return resolveOAuthToken(providerID, credential);
  }

  // Custom credentials — no standard token extraction
  return undefined;
}

/**
 * Resolve an OAuth token, refreshing if the access token has expired.
 * Persists the refreshed token back to the store.
 */
async function resolveOAuthToken(
  providerID: string,
  credential: OAuthCredential,
): Promise<string | undefined> {
  // Access token still valid — use it directly
  if (!isExpired(credential)) {
    return credential.accessToken;
  }

  // Refresh token also expired — nothing we can do
  if (isRefreshExpired(credential)) {
    return undefined;
  }

  // Attempt refresh
  const refreshed = await refreshAccessToken(credential);
  if (!refreshed) {
    return undefined;
  }

  // Persist the new tokens
  await store.set(providerID, refreshed);
  return refreshed.accessToken;
}
