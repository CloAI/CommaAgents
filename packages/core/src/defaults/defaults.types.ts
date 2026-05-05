// Global defaults types — provider registration and default overrides.

import type { Credential, CredentialStore } from "../credentials/credentials.types";
import type { ProviderFactory, ProviderResolver } from "../model/model.types";

// Provider registration

/**
 * Configuration for registering a custom provider with the global resolver.
 *
 * Provide either a direct `factory` function or a `packageName` + optional
 * `factoryName` for dynamic import resolution.
 *
 * @example
 * ```ts
 * // Direct factory — full control
 * registerProvider("my-llm", {
 *   factory: (credential) => (modelId) => myProvider({ apiKey: credential.key, model: modelId }),
 * });
 *
 * // Package-based — dynamic import with custom names
 * registerProvider("my-llm", {
 *   packageName: "my-ai-sdk",
 *   factoryName: "createMyLLM",
 * });
 * ```
 */
export interface ProviderRegistration {
  /**
   * Direct factory function — given a credential, returns a ProviderFactory.
   * When set, `packageName` and `factoryName` are ignored.
   */
  readonly factory?: (credential: Credential) => ProviderFactory | Promise<ProviderFactory>;

  /**
   * npm package name to dynamically import.
   * Defaults to `@ai-sdk/<providerId>` if omitted and `factory` is not set.
   */
  readonly packageName?: string;

  /**
   * Export name to look up on the imported module.
   * Defaults to `create<ProviderId>` (AI SDK convention) if omitted.
   */
  readonly factoryName?: string;
}

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
