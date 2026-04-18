// Flow loader types — configuration contracts for loadFlow.

import type { Agent } from "../../agents/agent/agent.types";
import type { FlowHooks } from "../flow/flow.types";

/**
 * Options for loading a flow from a description file.
 *
 * The `agents` registry is required — it maps agent names referenced in
 * the flow steps to live `Agent` instances. Agents can be created via
 * `createAgent()`, `loadAgent()`, or any other factory.
 *
 * @example
 * ```ts
 * import { loadAgent, loadFlow } from "@comma-agents/core";
 *
 * const writer = await loadAgent("./agents/writer.yaml");
 * const reviewer = await loadAgent("./agents/reviewer.yaml");
 *
 * const flow = await loadFlow("./flows/review-pipeline.yaml", {
 *   agents: { writer, reviewer },
 * });
 * ```
 */
export interface LoadFlowOptions {
  /** Registry of named agents that steps can reference. */
  readonly agents: Readonly<Record<string, Agent>>;
  /** Optional hooks to inject into the loaded flow. */
  readonly flowHooks?: FlowHooks;
}
