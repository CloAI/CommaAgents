// Executor module barrel — re-exports all public types and factories.

// Re-exported from @comma-agents/core (originally defined in daemon, now moved to core)
export type { ProviderResolver } from "@comma-agents/core";
export { extractProviderIds } from "@comma-agents/core";
export type { EventSink } from "./event-sink";
export type { CreateStrategyExecutorOptions, StrategyExecutor } from "./executor";
export { createStrategyExecutor } from "./executor";
export type { CreateInputBridgeOptions, InputBridge } from "./input-bridge";
export { createInputBridge } from "./input-bridge";
