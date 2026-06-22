// Strategy module barrel — single import point for strategy internals.
// Public API is exported from the package index.

export type {
  DiscoveredStrategy,
  DiscoveredStrategyOrigin,
  DiscoverStrategiesOptions,
  DiscoverStrategiesResult,
  DiscoveryWarning,
} from "./discover/index";
// Discovery
export { discoverStrategies, readStrategyFile } from "./discover/index";
// Factories
export { exportStrategy } from "./exporter/exporter";
// Config types
export type { ExportStrategyOptions } from "./exporter/exporter.types";
export { loadStrategy, loadStrategyFromString } from "./loader/loader";
export type {
  LoadedStrategy,
  LoadStrategyOptions,
} from "./loader/loader.types";
export type { LoadedProject } from "./loader/project-loader";
export { loadProject } from "./loader/project-loader";
// Schema (types, type guards, top-level validator)
export type {
  AgentDef,
  AgentStep,
  BroadcastFlowDef,
  BuiltInToolName,
  CommaProjectManifest,
  CustomAgentDef,
  CustomFlowDef,
  CycleFlowDef,
  FlowDef,
  LLMAgentDef,
  SequentialFlowDef,
  Strategy,
  UserAgentDef,
} from "./schema";
export {
  CommaProjectManifestSchema,
  CustomAgentDefSchema,
  CustomFlowDefSchema,
  isAgentStep,
  isCustomAgentDef,
  isFlowDef,
  isLLMAgentDef,
  isUserAgentDef,
  StrategySchema,
} from "./schema";
