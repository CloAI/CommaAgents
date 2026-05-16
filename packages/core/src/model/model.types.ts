import type { LanguageModel } from "ai";
import type { Credential } from "../credentials/credentials.types";
import type { ModelInfo, ModelsSource } from "./providers/providers.types";

/** Result of parsing a model string like "openai/gpt-4o". */
export interface ParsedModel {
  /** The provider identifier (e.g., "openai", "anthropic"). */
  readonly providerId: string;
  /** The model identifier (e.g., "gpt-4o", "claude-sonnet-4-5"). */
  readonly modelId: string;
  /** The npm package for the provider, if known. Undefined for custom providers. */
  readonly packageName: string | undefined;
}

/**
 * A function that creates a LanguageModel from a model ID.
 * Each provider (openai, anthropic, etc.) supplies one of these.
 *
 * @example
 * ```ts
 * import { createOpenAI } from "@ai-sdk/openai";
 * const providers = { openai: (id) => createOpenAI({ apiKey: "...", model: id }) };
 * ```
 */
export type ProviderFactory = (modelId: string) => LanguageModel;

/**
 * A function that translates a (providerId, credential) pair into a
 * ProviderFactory. Allows the strategy loader to auto-resolve credentials
 * from a CredentialStore and create provider instances on demand.
 *
 * Implementations are supplied by the consuming layer (daemon, CLI, examples)
 * so that core remains provider-agnostic.
 *
 * @example
 * ```ts
 * const resolver: ProviderResolver = async (providerId, credential) => {
 *   if (credential.type !== "api") throw new Error("Only API keys supported");
 *   const { createOpenAI } = await import("@ai-sdk/openai");
 *   return (modelId) => createOpenAI({ apiKey: credential.key })(modelId);
 * };
 * ```
 */
export type ProviderResolver = (
  providerId: string,
  credential: Credential,
) => ProviderFactory | Promise<ProviderFactory>;

/**
 * Aggregate metadata for a single provider.
 *
 * Emitted by `listProviders()` and the daemon's `list_providers` protocol
 * message. Consumers (like the TUI) use this to present provider/model
 * pickers and auth status indicators.
 *
 * Models are returned as rich `ModelInfo[]` entries with cost, context
 * window, capabilities, and modality metadata merged from the models.dev
 * catalog and (optionally) the provider's live API.
 */
export interface ProviderInfo {
  /** Canonical provider id (matches models.dev keys, e.g., `"github-copilot"`). */
  readonly id: string;
  /** Human-friendly display name (catalog `name` when available). */
  readonly name: string;
  /**
   * Configuration-level auth status. `"configured"` means a credential
   * was found via env var, strategy scope, or global scope. Not validated
   * against the provider's API.
   */
  readonly authStatus: "none" | "configured";
  /**
   * Normalized model metadata. Combines the catalog baseline with live
   * data (when `live === true` and credentials are available).
   */
  readonly models: readonly ModelInfo[];
  /** Provenance of the model list for this provider. */
  readonly modelsSource: ModelsSource;
  /** ISO timestamp when live data was fetched, if any. */
  readonly fetchedAt?: string;
  /** Error message when live discovery failed and we fell back to catalog. */
  readonly error?: string;
  /**
   * `true` if this provider was added via `registerProvider()` rather
   * than being derived from the models.dev catalog or built-in overrides.
   */
  readonly isCustom: boolean;
}
