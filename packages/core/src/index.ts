// @comma-agents/core
// Composable agent orchestration framework

// -- Agents --
export type { AgentConfig } from "./agents/base-agent";
export { BaseAgent, createAgent } from "./agents/base-agent";
// -- Agent hook middleware --
export {
  resolveHook,
  runAfterCallHooks,
  runAlterMessageHooks,
  runAlterResponseHooks,
  runBeforeCallHooks,
  withAgentHooks,
} from "./agents/hooks";
// -- Agent types (the core contracts) --
export type { Agent, AgentCallResult, AgentStreamEvent, HookedCallResult } from "./agents/types";
export type {
  InputCollector,
  InputRequest,
  UserAgentConfig,
} from "./agents/user/create-user-agent";
export { createUserAgent } from "./agents/user/create-user-agent";
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
// -- Flows (Phase 4) --
export { createBroadcastFlow } from "./flows/broadcast/broadcast-flow";
export { createCycleFlow } from "./flows/cycle/cycle-flow";
export { buildFlowResult, createFlow, createFlowContext, defineFlow } from "./flows/define-flow";
export { withFlowHooks } from "./flows/flow-hooks";
export { createSequentialFlow } from "./flows/sequential/sequential-flow";
export type {
  BroadcastFlowConfig,
  CustomFlowConfig,
  CycleFlowConfig,
  FlowConfig,
  FlowContext,
  FlowExecutor,
  FlowResult,
  FlowStep,
} from "./flows/types";
// -- Hooks --
export type {
  AgentHooks,
  CycleHooks,
  FlowHooks,
  SideEffectHook,
  ToolHooks,
  TransformHook,
} from "./hooks/types";
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
// -- Prompts (Phase 5) --
export {
  ConversationHistory,
  createConversationHistory,
} from "./prompts/history/conversation-history";
export type { BuildMessagesOptions, SystemPromptOptions } from "./prompts/message-builder";
export {
  buildMessages,
  resolveSystemPrompt,
} from "./prompts/message-builder";
export { createPromptTemplate, extractVariables } from "./prompts/template/prompt-template";
export type {
  ChatMessage,
  ChatRole,
  ConversationHistoryConfig,
  ConversationTurn,
  PromptTemplate,
  PromptTemplateConfig,
  TemplateValue,
  TemplateVariables,
  TruncationStrategy,
} from "./prompts/types";
export type { ExportStrategyOptions } from "./strategy/exporter";
// -- Strategy (Phase 7) --
export { exportStrategy } from "./strategy/exporter";
export type { LoadedStrategy, LoadStrategyOptions, ProviderFactory } from "./strategy/loader";
export { loadStrategy, loadStrategyFromString } from "./strategy/loader";
export type {
  AgentDef,
  AgentStep,
  BroadcastFlowDef,
  BuiltInToolName,
  CycleFlowDef,
  FlowDef,
  LLMAgentDef,
  SequentialFlowDef,
  Strategy,
  StrategyDefaults,
  UserAgentDef,
} from "./strategy/schema";
export {
  BUILT_IN_TOOL_NAMES,
  isAgentStep,
  isFlowDef,
  isLLMAgentDef,
  isUserAgentDef,
  StrategySchema,
} from "./strategy/schema";
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
export type { ToolContext, ToolDef, ToolResult } from "./tools/tool";
