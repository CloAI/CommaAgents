// Model resolution types — provider and model string contracts.

import type { LanguageModel } from "ai";
import type { Credential } from "../credentials/credentials.types";

// Parsed Model

/** Result of parsing a model string like "openai/gpt-4o". */
export interface ParsedModel {
  /** The provider identifier (e.g., "openai", "anthropic"). */
  readonly providerID: string;
  /** The model identifier (e.g., "gpt-4o", "claude-sonnet-4-5"). */
  readonly modelID: string;
  /** The npm package for the provider, if known. Undefined for custom providers. */
  readonly packageName: string | undefined;
}

// Provider Factory

/**
 * A function that creates a LanguageModel from a model ID.
 * Each provider (openai, anthropic, etc.) supplies one of these.
 *
 * @example
 * ```ts
 * import { openai } from "@ai-sdk/openai";
 * const providers = { openai: (id) => openai(id) };
 * ```
 */
export type ProviderFactory = (modelID: string) => LanguageModel;

// Provider Resolver

/**
 * A function that translates a (providerId, credential) pair into a
 * ProviderFactory. Allows the strategy loader to auto-resolve credentials
 * from a CredentialStore and create provider instances on demand.
 *
 * Implementations are supplied by the consuming layer (daemon, CLI, examples)
 * to keep `@ai-sdk/*` imports out of core.
 *
 * @example
 * ```ts
 * const resolver: ProviderResolver = async (providerId, credential) => {
 *   if (credential.type !== "api") throw new Error("Only API keys supported");
 *   const mod = await import(`@ai-sdk/${providerId}`);
 *   return (modelId) => mod.default({ apiKey: credential.key })(modelId);
 * };
 * ```
 */
export type ProviderResolver = (
  providerId: string,
  credential: Credential,
) => ProviderFactory | Promise<ProviderFactory>;
