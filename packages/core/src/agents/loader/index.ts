// Agent loader barrel — single import point for agent loader internals.
// Public API is exported from the package index.

// Factories
export { loadAgent, loadAgentFromString } from "./loader";
// Types
export type { AgentDescription } from "./loader.schema";
// Schema
export { AgentDescriptionSchema } from "./loader.schema";
export type { LoadAgentOptions } from "./loader.types";
