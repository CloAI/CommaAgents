// Strategy loader types — configuration and result contracts.

import type { LanguageModel } from "ai";
import type { Agent } from "../../agents/agent/agent.types";
import type { InputCollector } from "../../agents/built-in/user/user-agent.types";
import type { AgentHooks } from "../../agents/hooks/hooks.types";
import type { Credential, CredentialStore } from "../../credentials/credentials.types";
import type { FlowHooks } from "../../flows/flow/flow.types";
import type { ToolDefinition } from "../../tools/tool.types";
import type { Strategy } from "../schema";

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

/**
 * Options for loading a strategy.
 */
export interface LoadStrategyOptions {
  /**
   * Map of providerID to factory function.
   * Keys must match the provider portion of model strings (e.g., "openai" for "openai/gpt-4o").
   *
   * Optional when `credentialStore` + `providerResolver` are provided —
   * the loader will auto-resolve credentials and build factories on demand.
   * When both `providers` and credential-based resolution are available,
   * explicit `providers` entries take precedence.
   */
  readonly providers?: Readonly<Record<string, ProviderFactory>>;

  /**
   * Credential store for auto-resolving provider credentials at load time.
   *
   * When set alongside `providerResolver`, the loader will:
   * 1. Extract provider IDs from the strategy's model strings.
   * 2. Resolve credentials from the store for each provider.
   * 3. Pass each (providerId, credential) to `providerResolver` to get a factory.
   *
   * Providers already present in `providers` are skipped (explicit wins).
   */
  readonly credentialStore?: CredentialStore;

  /**
   * Translates a (providerId, credential) pair into a ProviderFactory.
   * Required when `credentialStore` is set. Ignored without `credentialStore`.
   */
  readonly providerResolver?: ProviderResolver;

  /**
   * Custom tools available beyond the built-in set.
   * Keys are tool names that can be referenced in agent definitions.
   */
  readonly customTools?: Readonly<Record<string, ToolDefinition>>;

  /**
   * Input collector function for user agents.
   * Required if the strategy contains any user agents with `requireInput: true`.
   */
  readonly inputCollector?: InputCollector;

  /**
   * Abort signal for the entire strategy execution.
   * Passed to all agents and flows that support cancellation.
   */
  readonly abort?: AbortSignal;

  /**
   * Agent hooks to inject into all LLM agents at load time.
   * Useful for the daemon to observe streaming events, call lifecycle, etc.
   */
  readonly agentHooks?: AgentHooks;

  /**
   * Flow hooks to inject into all flows at load time.
   * Useful for the daemon to observe step execution, flow lifecycle, etc.
   */
  readonly flowHooks?: FlowHooks;

  /**
   * Override the model for ALL LLM agents in the strategy.
   *
   * When set, every agent's model string is replaced with this value,
   * regardless of what the strategy file specifies. Format: "providerID/modelID".
   *
   * Useful for the daemon's `--model-override` flag, allowing a single
   * daemon instance to serve any provider/model combination without
   * editing strategy files.
   *
   * @example "github-copilot/gpt-4o"
   */
  readonly modelOverride?: string;
}

/**
 * The result of loading a strategy — contains the runnable flow
 * and metadata for inspection.
 */
export interface LoadedStrategy {
  /** Strategy name from the file. */
  readonly name: string;
  /** Strategy version from the file. */
  readonly version: string;
  /** Optional description. */
  readonly description?: string;
  /** The instantiated entry flow as a runnable Agent. */
  readonly flow: Agent;
  /** The instantiated agent registry (for inspection/testing). */
  readonly agents: Readonly<Record<string, Agent>>;
  /** The raw validated strategy data (for exporting). */
  readonly raw: Strategy;
}
