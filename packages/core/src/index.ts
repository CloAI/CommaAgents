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
export { hookIntoAgent } from "./agents/hook-into-agent/hook-into-agent";
// -- Hooks --
// Agent-specific hook types (co-located with agent code)
export type { AgentHooks, ToolHooks } from "./agents/hooks/hooks";
// -- Agent hook middleware --
export { createUserAgent } from "./agents/user/create-user-agent";
export type {
  InputCollector,
  InputRequest,
  UserAgentConfig,
} from "./agents/user/create-user-agent.types";
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
export type { SideEffectHook, TransformHook } from "./hooks/types";
export { runSideEffectHooks, runTransformHooks } from "./hooks/types";
// -- Model Registry & Auth (Phase 3) --
export type { CredentialEntry, CredentialStore } from "./model/auth/auth";
export {
  createCredentialReader,
  getCredential,
  getCredentialStorePath,
  getDataDir,
  listCredentials,
  readCredentialStore,
  removeCredential,
  setCredential,
  writeCredentialStore,
} from "./model/auth/auth";
export type { ParsedModel, ResolveKeyOptions } from "./model/registry";
export {
  getProviderPackage,
  isKnownProvider,
  KNOWN_PROVIDERS,
  PROVIDER_ENV_KEYS,
  parseModel,
  resolveInterpolation,
  resolveKey,
} from "./model/registry";
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
  ProviderFactory,
  SequentialFlowDef,
  Strategy,
  StrategyDefaults,
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
export type { ToolContext, ToolDef, ToolResult } from "./tools/tool.types";
