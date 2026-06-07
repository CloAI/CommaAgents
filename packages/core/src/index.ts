export type {
  AbortableAsyncGenerator,
  AbortablePromise,
} from "@comma-agents/utils";
export {
  createAbortableGenerator,
  createAbortablePromise,
} from "@comma-agents/utils";

export { createAgent } from "./agents/agent/agent";
export type {
  Agent,
  AgentCallResult,
  AgentConfig,
  AgentStreamEvent,
  ModelOptions,
} from "./agents/agent/agent.types";
export { createUserAgent } from "./agents/built-in/user/user-agent";
export type {
  InputCollector,
  InputRequest,
  UserAgentConfig,
} from "./agents/built-in/user/user-agent.types";
export { hookIntoAgent } from "./agents/hook-into-agent/hook-into-agent";
// Agent-specific hook types (co-located with agent code)
export type { AgentHooks, ToolHooks } from "./agents/hooks/hooks.types";
export type { AgentDescription, LoadAgentOptions } from "./agents/loader/index";
export {
  AgentDescriptionSchema,
  loadAgent,
  loadAgentFromString,
} from "./agents/loader/index";
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
export { createConversationContext } from "./context/index";
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
} from "./credentials/index";
export type { GlobalDefaults, ProviderRegistration } from "./defaults/index";
export {
  getGlobalCredentialStore,
  getGlobalDefaults,
  getGlobalProviderResolver,
  registerProvider,
  resetGlobalDefaults,
  setGlobalCredentialStore,
  setProviderCacheDir,
  unregisterProvider,
} from "./defaults/index";
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
export {
  buildFlowAgent,
  createBroadcastFlow,
  createCycleFlow,
  createFlow,
  createSequentialFlow,
  hookIntoFlow,
} from "./flows/index";
export type { FlowDescription, LoadFlowOptions } from "./flows/loader/index";
export {
  FlowDescriptionSchema,
  loadFlow,
  loadFlowFromString,
} from "./flows/loader/index";
export type {
  AccessRequest,
  AccessType,
  Guard,
  GuardCallbacks,
  GuardPermissionRequest,
  GuardPolicySnapshot,
  Policy,
  PolicyDecision,
} from "./guard/index";
export {
  approveCommandsPolicy,
  buildDefaultPolicies,
  createGuard,
  denyCommandsPolicy,
  forbiddenGlobsPolicy,
  pathPolicy,
} from "./guard/index";
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
export {
  createTokenTracker,
  useTokenTracking,
} from "./hooks/built-in/token-tracking/index";
export type {
  LanguageDiagnostic,
  LanguageDiagnosticSeverity,
  LanguageHoverResult,
  LanguageLocation,
  LanguagePosition,
  LanguageRange,
  LanguageService,
  LanguageSymbol,
  LspMethod,
  LspRequest,
  LspResponse,
} from "./language/index";
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
  ModelStatus,
  ModelsSource,
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
  getModelCapabilities,
  getModelMetadata,
  getProviderDefinition,
  getProviderInfo,
  getProviderPackage,
  getProvidersForModel,
  getReverseModelIndex,
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
  resolveCatalogCachePath,
  resolveModel,
  toModelInfo,
  unregisterModel,
  unregisterProviderDefinition,
} from "./model/index";
export type {
  BuildMessagesOptions,
  PromptTemplate,
  PromptTemplateConfig,
  SystemPromptOptions,
  TemplateValue,
  TemplateVariables,
} from "./prompts/index";
export {
  buildMessages,
  createPromptTemplate,
  resolveSystemPrompt,
} from "./prompts/index";
export type {
  AccessMode,
  PathPolicy,
  PermissionDecision,
  PermissionOperation,
  PermissionRequest,
  PermissionRequester,
  PolicyPatch,
  Sandbox,
  SandboxConfig,
} from "./sandbox/index";
export {
  createSandbox,
  DEFAULT_DAEMON_SANDBOX_CONFIG,
  DEFAULT_FORBIDDEN_GLOBS,
  DEFAULT_SANDBOX_CONFIG,
  getSandbox,
  inSandbox,
  PERMISSIVE_SANDBOX_CONFIG,
} from "./sandbox/index";
export type {
  LoadSkillsOptions,
  Skill,
  SkillLoadResult,
  SkillLoadWarning,
  SkillMetadata,
  SkillRegistry,
} from "./skills/index";
export {
  buildSkillsPromptHeader,
  createSkillRegistry,
  loadSkills,
} from "./skills/index";
export type {
  AgentDef,
  AgentStep,
  BroadcastFlowDef,
  BuiltInToolName,
  CommaProjectManifest,
  CycleFlowDef,
  DiscoveredStrategy,
  DiscoveredStrategyOrigin,
  DiscoverStrategiesOptions,
  DiscoverStrategiesResult,
  DiscoveryWarning,
  ExportStrategyOptions,
  FlowDef,
  LLMAgentDef,
  LoadedProject,
  LoadedStrategy,
  LoadStrategyOptions,
  SequentialFlowDef,
  Strategy,
  UserAgentDef,
} from "./strategy/index";
export {
  CommaProjectManifestSchema,
  discoverStrategies,
  exportStrategy,
  isAgentStep,
  isFlowDef,
  isLLMAgentDef,
  isUserAgentDef,
  loadProject,
  loadStrategy,
  loadStrategyFromString,
  readStrategyFile,
  StrategySchema,
} from "./strategy/index";
// Timeline and unified event timeline types/factories
export type {
  ProjectedConversationContext,
  Timeline,
  TimelineEvent,
  TimelineFilter,
} from "./timeline/index";
export {
  createTimeline,
  projectConversationContext,
  projectFileState,
} from "./timeline/index";
export {
  buildToolSystemPrompt,
  mergeSystemPrompts,
} from "./tools/build-tool-system-prompt";
export type { LspRequestData } from "./tools/built-in/lsp-request";
export { defineTool } from "./tools/define/define-tool";
export type {
  AuditEntry,
  AuditOperation,
  AuditSink,
  FileAuditSinkOptions,
  NewlineStyle,
  SessionFileEntry,
  SessionFileState,
  TrashEntry,
  TrashMetadata,
  UnifiedDiffOptions,
  WriteAtomicOptions,
} from "./tools/io";
export {
  applyBom,
  applyNewline,
  BINARY_DETECTION_SAMPLE_BYTES,
  BOM,
  buildSessionFileState,
  clearTrash,
  createFileAuditSink,
  createMemoryAuditSink,
  detectNewline,
  hasBom,
  isLikelyBinary,
  listTrash,
  moveToTrash,
  restoreFromTrash,
  STALE_FILE_RECOVERY_HINT,
  sha256OfBuffer,
  sha256OfFile,
  stripBom,
  toLF,
  trashWorkspaceDir,
  unifiedDiff,
  verifySessionFileState,
  writeAtomic,
} from "./tools/io";
export type {
  LaunchStrategyHandle,
  LaunchStrategyRequest,
  LaunchStrategyResult,
} from "./tools/launch-strategy.types";
export { errorResult, okResult, toolError } from "./tools/result";
export {
  getRegisteredToolNames,
  registerTool,
  resetToolRegistry,
  resolveTools,
  unregisterTool,
} from "./tools/tool.registry";
export type {
  ToolContext,
  ToolDefinition as ToolDef,
  ToolError,
  ToolErrorKind,
  ToolResult,
} from "./tools/tool.types";
