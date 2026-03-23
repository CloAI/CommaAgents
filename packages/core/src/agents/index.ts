// Agent module barrel — single import point for agent internals.
// Public API is exported from the package index.

// Factories
export { createAgent } from "./agent/agent";
// Types
export type {
  Agent,
  AgentCallResult,
  AgentConfig,
  AgentStreamEvent,
  LLMCallResult,
} from "./agent/agent.types";
export { hookIntoAgent } from "./hook-into-agent/hook-into-agent";
