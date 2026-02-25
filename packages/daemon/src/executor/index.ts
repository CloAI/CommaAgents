// Executor module barrel — re-exports all public types and factories.

export type { AuthBridge, CreateAuthBridgeOptions } from "./auth-bridge";
export { createAuthBridge } from "./auth-bridge";
export type { EventSink } from "./event-sink";
export type {
  CreateStrategyExecutorOptions,
  ProviderResolver,
  StrategyExecutor,
} from "./executor";
export { createStrategyExecutor, extractProviderIds } from "./executor";
export type { CreateInputBridgeOptions, InputBridge } from "./input-bridge";
export { createInputBridge } from "./input-bridge";
