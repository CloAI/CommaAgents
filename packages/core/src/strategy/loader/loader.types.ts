// Strategy loader types — configuration and result contracts.

import type { LanguageModel } from "ai";
import type { Agent } from "../../agents/agent/agent.types";
import type { AgentHooks } from "../../agents/hooks/hooks";
import type { InputCollector } from "../../agents/user/create-user-agent.types";
import type { FlowHooks } from "../../flows/flow/flow.types";
import type { ToolDef } from "../../tools/tool.types";
import type { Strategy } from "../schema";

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

/**
 * Options for loading a strategy.
 */
export interface LoadStrategyOptions {
  /**
   * Map of providerID to factory function.
   * Keys must match the provider portion of model strings (e.g., "openai" for "openai/gpt-4o").
   */
  readonly providers: Readonly<Record<string, ProviderFactory>>;

  /**
   * Custom tools available beyond the built-in set.
   * Keys are tool names that can be referenced in agent definitions.
   */
  readonly customTools?: Readonly<Record<string, ToolDef>>;

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
