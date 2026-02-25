/**
 * Auth module — credential management for comma-agents examples.
 *
 * Provides persistent credential storage and GitHub Copilot OAuth support.
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
 * const info = await store.get("openai");
 * ```
 */

import { PROVIDER_ENV_KEYS } from "@comma-agents/core";
import { isExpired, isRefreshExpired, refreshAccessToken } from "./copilot";
import type { OAuthInfo } from "./store";
import * as store from "./store";

// ---------------------------------------------------------------------------
// Re-exports
// ---------------------------------------------------------------------------

export { store };
export type { DeviceCodeResponse, PollResult } from "./copilot";
export {
  isExpired,
  isRefreshExpired,
  refreshAccessToken,
  startDeviceFlow,
} from "./copilot";
export type { ApiAuth, AuthInfo, OAuthInfo } from "./store";
export { ApiAuthSchema, AuthInfoSchema, OAuthSchema } from "./store";

// ---------------------------------------------------------------------------
// High-level credential resolution
// ---------------------------------------------------------------------------

/**
 * Resolve a usable API key / token for a provider.
 *
 * Resolution order:
 *   1. Environment variable (standard name from PROVIDER_ENV_KEYS)
 *   2. Credential store
 *      - For "api" credentials: returns the stored key directly
 *      - For "oauth" credentials: checks expiry, refreshes if needed,
 *        persists the refreshed token, returns the access token
 *
 * Returns `undefined` if no credential is available.
 *
 * This function is designed to be used as the `readCredential` callback
 * for core's `resolveKey()`, or called directly by example scripts.
 */
export async function resolveCredential(providerID: string): Promise<string | undefined> {
  // 1. Check environment variable first
  const envVar = PROVIDER_ENV_KEYS[providerID];
  if (envVar) {
    const envValue = process.env[envVar];
    if (envValue && envValue.trim().length > 0) {
      return envValue.trim();
    }
  }

  // 2. Check credential store
  const info = await store.get(providerID);
  if (!info) return undefined;

  if (info.type === "api") {
    return info.key;
  }

  // OAuth token — may need refresh
  if (info.type === "oauth") {
    return resolveOAuthToken(providerID, info);
  }

  return undefined;
}

/**
 * Resolve an OAuth token, refreshing if the access token has expired.
 * Persists the refreshed token back to the store.
 */
async function resolveOAuthToken(providerID: string, info: OAuthInfo): Promise<string | undefined> {
  // Access token still valid — use it directly
  if (!isExpired(info)) {
    return info.access;
  }

  // Refresh token also expired — nothing we can do
  if (isRefreshExpired(info)) {
    return undefined;
  }

  // Attempt refresh
  const refreshed = await refreshAccessToken(info);
  if (!refreshed) {
    return undefined;
  }

  // Persist the new tokens
  await store.set(providerID, refreshed);
  return refreshed.access;
}
