// @comma-agents/core
// Composable agent orchestration framework

export type { AbortableAsyncGenerator, AbortablePromise } from "@comma-agents/utils";
// -- Abortable utilities (re-exported from @comma-agents/utils) --
export { createAbortableGenerator, createAbortablePromise } from "@comma-agents/utils";

// -- Agent composition --
export { createAgent } from "./agents/agent/agent";
// -- Agents --
// -- Agent types (the core contracts) --
export type {
  Agent,
  AgentCallResult,
  AgentConfig,
  AgentStreamEvent,
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
// Re-export AI SDK message types and our ResponseMessage alias for consumer convenience
export type {
  AssistantModelMessage,
  ModelMessage,
  ResponseMessage,
  ToolModelMessage,
  UserModelMessage,
} from "./context/conversation-context.types";
export type {
  ContextStrategy,
  ConversationContext,
  ConversationContextConfig,
  ConversationTurn,
} from "./context/index";
// -- Context (conversation state management) --
export { createConversationContext } from "./context/index";
// -- Credentials --
export type {
  ApiCredential,
  AuthStatus,
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
  SandboxViolationError,
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
export type { FlowDescription, LoadFlowOptions } from "./flows/loader/index";
// -- Flow loader (standalone flow files) --
export { FlowDescriptionSchema, loadFlow, loadFlowFromString } from "./flows/loader/index";
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
export type {
  CatalogData,
  CatalogModel,
  CatalogProvider,
  ListModelsContext,
  ListModelsFn,
  ListModelsResult,
  Modality,
  ModelCapabilities,
  ModelCost,
  ModelInfo,
  ModelModalities,
  ModelsSource,
  ModelStatus,
  ParsedModel,
  ProviderDefinition,
  ProviderFactory,
  ProviderInfo,
  ProviderResolver,
  ProviderWithModels,
} from "./model/index";
export {
  extractProviderIds,
  getCatalogModels,
  getCatalogProvider,
  getCatalogProviderSync,
  getCatalogSnapshot,
  getProviderDefinition,
  getProviderInfo,
  getProviderPackage,
  isKnownProvider,
  listAllProviderModels,
  listCatalogProviders,
  listProviderDefinitions,
  listProviderModels,
  listProviders,
  loadCatalog,
  parseModel,
  refreshCatalog,
  registerModel,
  registerProviderDefinition,
  resetCatalog,
  resetModelRegistry,
  resetProviderRegistry,
  resolveModel,
  unregisterModel,
  unregisterProviderDefinition,
} from "./model/index";
export type {
  BuildMessagesOptions,
  SystemPromptOptions,
} from "./prompts/message-builder";
// -- Prompts --
export { buildMessages, resolveSystemPrompt } from "./prompts/message-builder";
export { createPromptTemplate } from "./prompts/template/prompt-template";
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
// -- Sandbox --
export { createSandbox } from "./sandbox/index";
export { DEFAULT_SANDBOX_CONFIG, PERMISSIVE_SANDBOX_CONFIG } from "./sandbox/sandbox.constants";
export type {
  AccessMode,
  AuthorizationContext,
  PathPolicy,
  PermissionDecision,
  PermissionOperation,
  PermissionRequest,
  PermissionRequester,
  PolicyChangeListener,
  PolicyPatch,
  PolicySnapshot,
  Sandbox,
  SandboxConfig,
  SandboxDependencies,
} from "./sandbox/index";
