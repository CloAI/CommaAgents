// Agent loader types — configuration contracts for loadAgent.

import type { AgentTypeRuntime } from "../registry/agent-registry.types";

/**
 * Options for loading a built-in or registered custom agent.
 *
 * Runtime fields are forwarded to registered factories. Applicable fields are
 * also passed to built-in LLM agents.
 *
 * @example
 * ```ts
 * const agent = await loadAgent("./agents/researcher.yaml", {
 *   modelOverride: "openai/gpt-4o",
 * });
 * ```
 */
export type LoadAgentOptions = AgentTypeRuntime;
