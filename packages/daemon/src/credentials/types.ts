// Credential store types, interfaces, and well-known env var mappings.

import type { Credential } from "../protocol/shared";

// Re-export Credential types from protocol for convenience.
export type {
  ApiCredential,
  Credential,
  CustomCredential,
  OAuthCredential,
} from "../protocol/shared";

// Storage data shape

/**
 * Persisted credential data.
 *
 * Top-level keys are scopes:
 * - `"$global"` — credentials available to all strategies.
 * - Any other key — a strategy name for strategy-scoped overrides.
 *
 * Within each scope, keys are provider IDs → credential objects.
 *
 * Example:
 * ```json
 * {
 *   "$global": { "anthropic": { "type": "api", "key": "sk-..." } },
 *   "my-strategy": { "openai": { "type": "api", "key": "sk-..." } }
 * }
 * ```
 */
export type CredentialStoreData = Record<string, Record<string, Credential>>;

// Backend interface (storage abstraction)

/**
 * Low-level storage backend for credential data.
 *
 * Implementations handle serialization, file I/O, and encryption.
 * The store itself handles scoping, resolution priority, and env vars.
 */
export interface CredentialBackend {
  /** Read all credential data from storage. Returns empty object if none exists. */
  readAll(): Promise<CredentialStoreData>;
  /** Write the full credential data to storage (atomic replace). */
  writeAll(data: CredentialStoreData): Promise<void>;
}

// Store interface (public API)

/**
 * Credential store — resolves, gets, sets, and removes credentials.
 *
 * Resolution priority (most specific wins):
 * 1. Strategy-scoped credential (if `scope` is provided and not `"$global"`)
 * 2. Environment variable (using well-known or custom env var mapping)
 * 3. Global-scoped credential (`"$global"`)
 */
export interface CredentialStore {
  /**
   * Resolve the best credential for a provider.
   *
   * Checks strategy scope → env vars → global scope, returning the
   * first match found. Returns `undefined` if no credential is available.
   *
   * @param providerId - The provider to resolve credentials for.
   * @param scope - Optional strategy name. If omitted, only env vars and global scope are checked.
   */
  resolve(providerId: string, scope?: string): Promise<Credential | undefined>;

  /**
   * Get a credential from a specific scope (no fallback/resolution chain).
   */
  get(providerId: string, scope: string): Promise<Credential | undefined>;

  /**
   * Set a credential in a specific scope.
   */
  set(providerId: string, scope: string, credential: Credential): Promise<void>;

  /**
   * Remove a credential from a specific scope.
   * Returns `true` if the credential existed and was removed.
   */
  remove(providerId: string, scope: string): Promise<boolean>;

  /**
   * List all provider IDs that have credentials in a given scope.
   */
  list(scope: string): Promise<string[]>;

  /**
   * List all scopes that have at least one credential.
   */
  listScopes(): Promise<string[]>;
}

// Environment variable mapping

/**
 * Maps a provider ID to the environment variable name(s) that
 * typically contain its API key.
 *
 * The first env var in the array is the "primary" — the one we check
 * first and suggest to users. Additional entries are aliases.
 */
export type EnvVarMap = Record<string, string[]>;

/**
 * Well-known environment variable names for common AI providers.
 *
 * This is intentionally a subset — strategies can specify custom
 * env var names via the strategy schema, and users can extend
 * this map via configuration.
 */
export const WELL_KNOWN_ENV_VARS: EnvVarMap = {
  openai: ["OPENAI_API_KEY"],
  anthropic: ["ANTHROPIC_API_KEY"],
  google: ["GOOGLE_GENERATIVE_AI_API_KEY", "GOOGLE_API_KEY"],
  "google-vertex": ["GOOGLE_VERTEX_API_KEY"],
  "github-copilot": ["GITHUB_TOKEN"],
  mistral: ["MISTRAL_API_KEY"],
  cohere: ["COHERE_API_KEY"],
  groq: ["GROQ_API_KEY"],
  perplexity: ["PERPLEXITY_API_KEY"],
  fireworks: ["FIREWORKS_API_KEY"],
  together: ["TOGETHER_AI_API_KEY", "TOGETHER_API_KEY"],
  deepseek: ["DEEPSEEK_API_KEY"],
  xai: ["XAI_API_KEY"],
  openrouter: ["OPENROUTER_API_KEY"],
};

// Store factory options

/** Options for creating a credential store. */
export interface CreateCredentialStoreOptions {
  /** The storage backend to use. */
  backend: CredentialBackend;
  /**
   * Additional env var mappings to merge with WELL_KNOWN_ENV_VARS.
   * Provider IDs here override well-known entries for the same key.
   */
  envVarOverrides?: EnvVarMap;
  /**
   * Override `process.env` for testing.
   * @internal
   */
  env?: Record<string, string | undefined>;
}
