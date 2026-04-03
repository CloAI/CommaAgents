// Agent hooks barrel — hook infrastructure and composable hook utilities.
// Public API is exported from the package index.

// Infrastructure
export { resolveHook } from "./hooks";
// Types
export type { AgentHooks, ToolHooks } from "./hooks.types";
export type {
  ModelMetadata,
  TokenSnapshot,
  TokenTracker,
  TokenTrackerConfig,
  TokenUsageRecord,
  UseTokenTrackingConfig,
} from "../../hooks/built-in/token-tracking/index";
// Token tracking
export { createTokenTracker, useTokenTracking } from "../../hooks/built-in/token-tracking/index";
