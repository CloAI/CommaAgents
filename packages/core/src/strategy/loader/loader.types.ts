// Strategy loader types — configuration and result contracts.

import type { Agent } from "../../agents/agent/agent.types";
import type { AgentTypeRuntime } from "../../agents/registry/agent-registry.types";
import type { FlowHooks } from "../../flows/flow/flow.types";
import type { Strategy } from "../schema";

/**
 * Options for loading a strategy.
 *
 * Model and tool resolution happen internally via global registries
 * (registerModel / registerProvider / registerTool). The loader does
 * not accept provider factories or credential stores — callers must
 * configure those globally before loading a strategy.
 */
export interface LoadStrategyOptions extends AgentTypeRuntime {
  /**
   * Flow hooks to inject into all flows via `hookIntoFlow()` after
   * construction. Useful for the daemon to observe step execution,
   * flow lifecycle, etc.
   */
  readonly flowHooks?: FlowHooks;
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
