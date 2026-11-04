import type { LanguageModel } from "ai";
import type {
  PrivacyRequirements,
  PrivacyRuntime,
  PrivacyReport,
} from "./privacy";
import type { Credential } from "../credentials/credentials.types";
export type { ProviderInfo } from "./providers/providers.types";

/** Per-resolution privacy requirements and the trusted verification runtime. */
export interface ModelResolutionOptions {
  /** Minimum required protections; advertised TEE/E2EE capabilities are always required. */
  readonly privacy?: PrivacyRequirements;
  /** Runtime that verifies protection; advertised capabilities use the default runtime when omitted. */
  readonly privacyRuntime?: PrivacyRuntime;
  /** Cancellation covering verification and inference setup. */
  readonly signal?: AbortSignal;
  /** Receive content-free evidence reports for protected requests. */
  readonly onPrivacyReport?: (report: PrivacyReport) => void;
}

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

/** Model and effective privacy services selected for one invocation. @internal */
export interface ResolvedModel {
  /** Model ready for invocation. */
  readonly model: LanguageModel;
  /** Effective requirements, including automatically advertised protection. */
  readonly privacy?: PrivacyRequirements;
  /** Runtime inherited by related requests such as compaction. */
  readonly privacyRuntime?: PrivacyRuntime;
}
