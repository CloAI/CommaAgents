// Credential store — thin wrapper around @comma-agents/core's credential store.
//
// Provides a simplified API for examples that always operates on the
// "$global" scope. Uses core's resolveCredentialsPath() for the
// platform-aware store file location.
//
// The core types (Credential, OAuthCredential, ApiCredential) are
// re-exported for convenience.

import {
  type Credential,
  type CredentialStore,
  createCredentialStore,
  createJsonFileBackend,
  type OAuthCredential,
  resolveCredentialsPath,
} from "@comma-agents/core";

export type {
  ApiCredential,
  Credential,
  OAuthCredential,
} from "@comma-agents/core";

/** Default scope used for all example credential operations. */
const GLOBAL_SCOPE = "$global";

// Lazily-initialized singleton store instance

let storeInstance: CredentialStore | undefined;

function getStore(): CredentialStore {
  if (!storeInstance) {
    storeInstance = createCredentialStore({
      backend: createJsonFileBackend({ filePath: resolveCredentialsPath() }),
    });
  }
  return storeInstance;
}

// Simplified public API (always uses $global scope)

/**
 * Get a stored credential for a provider.
 * Returns `undefined` if nothing is stored.
 */
export async function get(providerID: string): Promise<Credential | undefined> {
  return getStore().get(providerID, GLOBAL_SCOPE);
}

/**
 * Store a credential for a provider.
 * Overwrites any existing credential for that provider.
 */
export async function set(
  providerID: string,
  credential: Credential,
): Promise<void> {
  await getStore().set(providerID, GLOBAL_SCOPE, credential);
}

/**
 * Remove a stored credential for a provider.
 * No-op if no credential is stored for that provider.
 */
export async function remove(providerID: string): Promise<void> {
  await getStore().remove(providerID, GLOBAL_SCOPE);
}

/**
 * Get all stored credentials from the global scope.
 */
export async function all(): Promise<Record<string, Credential>> {
  const store = getStore();
  const providerIds = await store.list(GLOBAL_SCOPE);
  const result: Record<string, Credential> = {};
  for (const providerId of providerIds) {
    const credential = await store.get(providerId, GLOBAL_SCOPE);
    if (credential) {
      result[providerId] = credential;
    }
  }
  return result;
}

/**
 * Resolve the best credential for a provider using the core resolution chain.
 * Checks: strategy scope -> env vars -> $global scope.
 */
export async function resolve(
  providerID: string,
  scope?: string,
): Promise<Credential | undefined> {
  return getStore().resolve(providerID, scope);
}

/**
 * Extract a usable token string from a Credential.
 *
 * - `api` credentials return the key.
 * - `oauth` credentials return the accessToken.
 * - `custom` credentials return `undefined` (no standard token field).
 */
export function extractToken(credential: Credential): string | undefined {
  switch (credential.type) {
    case "api":
      return credential.key;
    case "oauth":
      return credential.accessToken;
    case "custom":
      return undefined;
  }
}
