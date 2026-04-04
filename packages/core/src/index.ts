// @comma-agents/core
// Composable agent orchestration framework

// -- Agent composition --
export { createAgent } from "./agents/agent/agent";
// -- Agents --
// -- Agent types (the core contracts) --
export type {
  Agent,
  AgentCallResult,
  AgentConfig,
  AgentStreamEvent,
  LLMCallResult,
} from "./agents/agent/agent.types";
// -- Agent hook middleware --
export { createUserAgent } from "./agents/built-in/user/user-agent";
export type {
  InputCollector,
  InputRequest,
  UserAgentConfig,
} from "./agents/built-in/user/user-agent.types";
export { hookIntoAgent } from "./agents/hook-into-agent/hook-into-agent";
// -- Hooks --
// Agent-specific hook types (co-located with agent code)
export type { AgentHooks, ToolHooks } from "./agents/hooks/hooks.types";
export type { AgentDescription, LoadAgentOptions } from "./agents/loader/index";
// -- Agent loader (standalone agent files) --
export { AgentDescriptionSchema, loadAgent, loadAgentFromString } from "./agents/loader/index";
// -- Credentials --
export type {
  ApiCredential,
  CreateCredentialStoreOptions,
  Credential,
  CredentialBackend,
  CredentialStore,
  CredentialStoreData,
  CustomCredential,
  EnvVarMap,
  JsonFileBackendOptions,
  OAuthCredential,
} from "./credentials/index";
export {
  ApiCredentialSchema,
  CredentialSchema,
  CustomCredentialSchema,
  createCredentialStore,
  createJsonFileBackend,
  OAuthCredentialSchema,
  resolveCredentialsPath,
  resolveDataDir,
  WELL_KNOWN_ENV_VARS,
} from "./credentials/index";
// -- Global Defaults --
export type { GlobalDefaults, ProviderRegistration } from "./defaults/index";
export {
  getGlobalCredentialStore,
  getGlobalDefaults,
  getGlobalProviderResolver,
  registerProvider,
  resetGlobalDefaults,
  setGlobalCredentialStore,
  unregisterProvider,
} from "./defaults/index";
// -- Errors --
export {
  AgentCallError,
  CommaAgentsError,
  FlowExecutionError,
  HookExecutionError,
  ModelResolutionError,
  StrategyValidationError,
  ToolExecutionError,
} from "./errors/index";
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
} from "./flows/index";
// -- Flows (Phase 4) --
export {
  buildFlowAgent,
  createBroadcastFlow,
  createCycleFlow,
  createFlow,
  createSequentialFlow,
  hookIntoFlow,
} from "./flows/index";
// Shared hook infrastructure
export type { SideEffectHook, TransformHook } from "./hooks";
export { runSideEffectHooks, runTransformHooks } from "./hooks";
export type {
  ModelMetadata,
  TokenSnapshot,
  TokenTracker,
  TokenTrackerConfig,
  TokenUsageRecord,
  UseTokenTrackingConfig,
} from "./hooks/built-in/token-tracking/index";
// -- Token Tracking --
export { createTokenTracker, useTokenTracking } from "./hooks/built-in/token-tracking/index";
// -- Model resolution --
export type { ParsedModel, ProviderFactory, ProviderResolver } from "./model/index";
export {
  extractProviderIds,
  getProviderPackage,
  isKnownProvider,
  KNOWN_PROVIDERS,
  parseModel,
  registerModel,
  resetModelRegistry,
  resolveModel,
  unregisterModel,
} from "./model/index";
export type { ConversationHistory } from "./prompts/history/conversation-history";
// -- Prompts (Phase 5) --
export { createConversationHistory } from "./prompts/history/conversation-history";
export type {
  BuildMessagesOptions,
  SystemPromptOptions,
} from "./prompts/message-builder";
export { buildMessages, resolveSystemPrompt } from "./prompts/message-builder";
export { createPromptTemplate } from "./prompts/template/prompt-template";
// Re-export AI SDK message types and our ResponseMessage alias for consumer convenience
export type {
  AssistantModelMessage,
  ModelMessage,
  ResponseMessage,
  ToolModelMessage,
  UserModelMessage,
} from "./prompts/types";
export type {
  AgentDef,
  AgentStep,
  BroadcastFlowDef,
  BuiltInToolName,
  CycleFlowDef,
  ExportStrategyOptions,
  FlowDef,
  LLMAgentDef,
  LoadedStrategy,
  LoadStrategyOptions,
  SequentialFlowDef,
  Strategy,
  UserAgentDef,
} from "./strategy/index";
// -- Strategy (Phase 7) --
export {
  exportStrategy,
  isAgentStep,
  isFlowDef,
  isLLMAgentDef,
  isUserAgentDef,
  loadStrategy,
  loadStrategyFromString,
  StrategySchema,
} from "./strategy/index";
export type {
  BashToolConfig,
  DefaultToolsConfig,
  GlobToolConfig,
  GrepToolConfig,
  ReadToolConfig,
} from "./tools/built-in/index";
// -- Built-in Tools (Phase 6) --
export {
  createBashTool,
  createDefaultTools,
  createEditTool,
  createGlobTool,
  createGrepTool,
  createReadTool,
  createWriteTool,
} from "./tools/built-in/index";
// -- Tools --
export { defineTool } from "./tools/define/define-tool";
// -- Tool registry --
export {
  getRegisteredToolNames,
  registerTool,
  resetToolRegistry,
  resolveTools,
  unregisterTool,
} from "./tools/tool.registry";
export type { ToolContext, ToolDefinition as ToolDef, ToolResult } from "./tools/tool.types";
