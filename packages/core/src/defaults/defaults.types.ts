// Global defaults types — default overrides for credentials and provider resolution.

import type { CredentialStore } from "../credentials/credentials.types";
import type { ProviderResolver } from "../model/model.types";

// Global defaults facade

/**
 * Read-only view of the current global defaults state.
 * Returned by `getGlobalDefaults()` for inspection/testing.
 */
export interface GlobalDefaults {
  /** The current global credential store (lazily created if not overridden). */
  readonly credentialStore: CredentialStore;
  /** The current global provider resolver (uses registry + dynamic import fallback). */
  readonly providerResolver: ProviderResolver;
  /** Snapshot of registered provider IDs (does not include catalog-derived providers). */
  readonly registeredProviderIds: readonly string[];
}
