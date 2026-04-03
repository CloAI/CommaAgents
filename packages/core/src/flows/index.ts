// Flow module barrel — single import point for flow internals.
// Public API is exported from the package index.

// Factories
export { createBroadcastFlow } from "./built-in/broadcast/broadcast-flow";
export { createCycleFlow } from "./built-in/cycle/cycle-flow";
export { createSequentialFlow } from "./built-in/sequential/sequential-flow";
export { buildFlowAgent, createFlow } from "./flow/flow";
// Types (interfaces + config types + hook types)
export type {
  BroadcastFlowConfig,
  CustomFlowConfig,
  CycleFlowConfig,
  CycleHooks,
  FlowConfig,
  FlowContext,
  FlowExecutor,
  FlowHooks,
  FlowResult,
} from "./flow/flow.types";
export { hookIntoFlow } from "./hook-into-flow/hook-into-flow";
