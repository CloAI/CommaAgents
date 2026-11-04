// @comma-agents/core
// Composable agent orchestration framework

export type { AbortableAsyncGenerator, AbortablePromise } from "./abortable";
// -- Abortable utilities (re-exported from @comma-agents/utils) --
export {
  createPrivacyRuntime,
  PrivacyRequirementsSchema,
} from "./model/privacy";
export type {
  PrivacyRequirements,
  PrivacyRuntime,
  PrivacyRuntimeOptions,
  PrivacyResolutionOptions,
  PrivacyReport,
  PrivacyEvent,
  PrivacyDiagnostic,
  PrivacyProviderError,
  PrivacyWorkloadMeasurements,
  PrivacyWorkloadPolicy,
  PrivacyWorkloadMismatch,
  PrivacyLimits,
  PrivacyCheckStatus,
  PrivacyError,
  PrivacyErrorCode,
} from "./model/privacy";
export type {
  VenicePrivacyOptions,
  VeniceWorkloadPolicy,
  VeniceWorkloadMeasurements,
} from "./model/providers/venice/venice.types";
export type { ModelResolutionOptions } from "./model/model.types";

export { createAbortableGenerator, createAbortablePromise } from "./abortable";

// -- Agent composition --
export { createAgent } from "./agents/agent/agent";
// -- Agents --
// -- Agent types (the core contracts) --
export type {
  Agent,
  AgentCallIdentity,
  AgentCallFailure,
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
export type { AgentDescription } from "./agents/loader/index";
// -- Agent loader (standalone agent files) --
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
} from "./conversation-context";
export type {
  ConversationHistory,
  ConversationRecord,
  ConversationRetentionEvent,
} from "./conversation-context";
export type {
  LaunchStrategyHandle,
  LaunchStrategyRequest,
  LaunchStrategyResult,
} from "./tools/launch-strategy.types";
export type { TimelineEvent } from "./timeline";
export type {
  ConversationContext,
  ConversationContextOptions,
} from "./conversation-context";
// -- Context (conversation state management) --
export { createConversationContext } from "./conversation-context";
export { createJsonFileCredentialBackend } from "./credentials/backends/json-file";
export { createCredentialStore } from "./credentials/credentials";
export type {
  ApiCredential,
  Credential,
  CustomCredential,
  OAuthCredential,
} from "./credentials/credentials.schema";
export {
  ApiCredentialSchema,
  CredentialSchema,
  CustomCredentialSchema,
  OAuthCredentialSchema,
} from "./credentials/credentials.schema";
export type {
  AuthStatus,
  CreateCredentialStoreOptions,
  CredentialBackend,
  CredentialStore,
  CredentialStoreData,
  EnvVarMap,
} from "./credentials/credentials.types";
export {
  getGlobalCredentialStore,
  resetGlobalCredentialStore,
  setGlobalCredentialStore,
} from "./credentials/global-credential-store";

export {
  getApplicationDataDirectory,
  getCatalogCachePath,
  getCredentialsPath,
  getGlobalMcpConfigPath,
  getGlobalSkillsDirectory,
  getHubDirectory,
  getPackagesDirectory,
  getProjectAuditDirectory,
  getProjectDirectory,
  getProjectMcpConfigPath,
  getProjectSkillsDirectory,
  getProjectStrategiesDirectory,
  getProviderInstallDirectory,
  getStrategiesDirectory,
  getTrashDirectory,
  resetCoreLocationOverrides,
  setApplicationDataDirectory,
  setCatalogCachePath,
  setCredentialsPath,
  setGlobalSkillsDirectory,
  setProviderInstallDirectory as setProviderInstallDirectoryPath,
} from "./defaults/defaults";
export {
  DEFAULT_APPLICATION_DATA_DIRECTORY_NAME,
  DEFAULT_AUDIT_DIRECTORY_NAME,
  DEFAULT_CACHE_DIRECTORY_NAME,
  DEFAULT_CATALOG_CACHE_FILENAME,
  DEFAULT_CREDENTIALS_FILENAME,
  DEFAULT_GLOBAL_SKILLS_DIRECTORY_NAME,
  DEFAULT_HUB_DIRECTORY_NAME,
  DEFAULT_MCP_CONFIG_FILENAME,
  DEFAULT_PACKAGES_DIRECTORY_NAME,
  DEFAULT_PROJECT_DIRECTORY_NAME,
  DEFAULT_PROVIDERS_DIRECTORY_NAME,
  DEFAULT_STRATEGIES_DIRECTORY_NAME,
  DEFAULT_TRASH_DIRECTORY_NAME,
  PROCESS_ENV_COMMA_AGENTS_CATALOG_CACHE_FILENAME,
  PROCESS_ENV_COMMA_AGENTS_CREDENTIALS_FILENAME,
  PROCESS_ENV_COMMA_AGENTS_DATA_DIRECTORY,
  PROCESS_ENV_COMMA_AGENTS_MCP_CONFIG_FILENAME,
  PROCESS_ENV_COMMA_AGENTS_PROJECT_DIRECTORY_NAME,
} from "./defaults/defaults.constants";
export type { CoreLocationOverrides } from "./defaults/defaults.types";

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
export {
  createTokenTracker,
  useTokenTracking,
} from "./hooks/built-in/token-tracking/index";
export {
  registerModel,
  resetModelRegistry,
  resolveModel,
  unregisterModel,
} from "./model/model";
export type {
  ParsedModel,
  ProviderFactory,
  ProviderInfo,
  ProviderResolver,
} from "./model/model.types";
export {
  extractProviderIds,
  formatProviderName,
  getModelCapabilities,
  getModelMetadata,
  getProviderInfo,
  getProviderPackage,
  getQualifiedModelMetadata,
  isKnownProvider,
  listProviders,
  parseModel,
} from "./model/model.utils";
export { getModelFamily, resolveModelReference } from "./model/roles";
export type { ModelFamily, ModelRoleSources, ModelRoles } from "./model/roles";
export type {
  CatalogData,
  CatalogModel,
  CatalogProvider,
  ListModelsContext,
  ListModelsFn,
  Modality,
  ModelCapabilities,
  ModelCost,
  ModelInfo,
  ModelModalities,
  ModelStatus,
  ModelSource,
  ProviderOrigin,
  ProviderDefinition,
} from "./model/providers/index";
export {
  getCatalogModels,
  getCatalogProvider,
  getCatalogProviderSync,
  getCatalogSnapshot,
  getGlobalProviderResolver,
  getProviderDefinition,
  getProviderPackageNameSync,
  getProvidersForModel,
  getRegisteredProviderIds,
  getReverseModelIndex,
  isKnownProviderSync,
  refreshProviderModels,
  listCatalogProviders,
  listProviderDefinitions,
  listProviderModels,
  loadCatalog,
  mergeCatalogWithProvider,
  mergeModelInfo,
  refreshCatalog,
  registerProviderDefinition,
  resetCatalog,
  resetGlobalProviderResolver,
  resetProviderRegistry,
  resolveCredentialForProvider,
  setProviderInstallDirectory,
  sortModels,
  toModelInfo,
  unregisterProviderDefinition,
} from "./model/providers/index";

export type {
  BuildMessagesOptions,
  SystemPromptOptions,
} from "./prompts/message-builder";
// -- Prompts --
export { buildMessages, resolveSystemPrompt } from "./prompts/message-builder";
export { createPromptTemplate } from "./prompts/template/prompt-template";
export {
  buildContextBlocks,
  describeEnvironment,
  loadProjectInstructions,
  renderContextBlocks,
} from "./prompts/context-blocks";
export type {
  BuildContextBlocksOptions,
  ContextBlockSelection,
  EnvironmentDescription,
  GitSummary,
  ProjectInstruction,
} from "./prompts/context-blocks";
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
  ApplyPatchChangedFile,
  ApplyPatchData,
  ApplyPatchToolConfig,
} from "./tools/built-in/apply-patch";
export { createApplyPatchTool } from "./tools/built-in/apply-patch";
export type { AskQuestionData } from "./tools/built-in/ask-question";
export {
  askQuestionParams,
  createAskQuestionTool,
} from "./tools/built-in/ask-question";
export type {
  CreateFileData,
  CreateFileToolConfig,
} from "./tools/built-in/create-file";
export { createCreateFileTool } from "./tools/built-in/create-file";
export type {
  DeleteFileData,
  DeleteFileToolConfig,
} from "./tools/built-in/delete-file";
export { createDeleteFileTool } from "./tools/built-in/delete-file";
export type {
  AppliedEdit,
  EditFileData,
  EditFileToolConfig,
  MatchRange,
} from "./tools/built-in/edit-file";
export { createEditFileTool } from "./tools/built-in/edit-file";
export type {
  GlobData,
  GlobMatch,
  GlobToolConfig,
} from "./tools/built-in/glob";
export { createGlobTool, globParams } from "./tools/built-in/glob";
export type { LaunchStrategyData } from "./tools/built-in/launch-strategy";
export { createLaunchStrategyTool } from "./tools/built-in/launch-strategy";
export type {
  DelegateData,
  DelegateJsonValue,
  DelegateTaskResult,
  SubagentTarget,
} from "./tools/built-in/delegate";
export { createDelegateTool } from "./tools/built-in/delegate";
export type { NotesData, ResearchNote } from "./tools/built-in/notes";
export { createNotesAddTool, createNotesGetTool } from "./tools/built-in/notes";
export type {
  WebSearchData,
  WebSearchProvider,
  WebSearchRequest,
  WebSearchResult,
  WebSearchToolConfig,
} from "./tools/built-in/web-search";
export {
  createBraveSearchProvider,
  createSearxngSearchProvider,
  createWebSearchTool,
} from "./tools/built-in/web-search";
export type {
  RequestStrategySwitchData,
  StrategySwitchHandle,
  StrategySwitchRequest,
} from "./tools/built-in/request-strategy-switch";
export { createRequestStrategySwitchTool } from "./tools/built-in/request-strategy-switch";
export type {
  ListDirectoryData,
  ListDirectoryEntry,
  ListDirectoryToolConfig,
} from "./tools/built-in/list-directory";
export { createListDirectoryTool } from "./tools/built-in/list-directory";
export type {
  ListSkillsData,
  ListSkillsEntry,
} from "./tools/built-in/list-skills";
export { createListSkillsTool } from "./tools/built-in/list-skills";
export type {
  ListStrategyData,
  ListStrategyEntry,
} from "./tools/built-in/list-strategy";
export { createListStrategyTool } from "./tools/built-in/list-strategy";
export type { LoadSkillData } from "./tools/built-in/load-skill";
export { createLoadSkillTool } from "./tools/built-in/load-skill";
export type { LspRequestData } from "./tools/built-in/lsp-request";
export { createLspRequestTool } from "./tools/built-in/lsp-request";
export type {
  MoveFileData,
  MoveFileToolConfig,
} from "./tools/built-in/move-file";
export { createMoveFileTool } from "./tools/built-in/move-file";
export type {
  ReadFileData,
  ReadFileToolConfig,
} from "./tools/built-in/read-file";
export { createReadFileTool } from "./tools/built-in/read-file";
export type { RestoreFileData } from "./tools/built-in/restore-file";
export { createRestoreFileTool } from "./tools/built-in/restore-file";
export type {
  PlatformInfo,
  RunCommandData,
  RunCommandToolConfig,
} from "./tools/built-in/run-command";
export { createRunCommandTool } from "./tools/built-in/run-command";
export type {
  SearchFilesData,
  SearchFilesMatch,
  SearchFilesToolConfig,
} from "./tools/built-in/search-files";
export { createSearchFilesTool } from "./tools/built-in/search-files";
export {
  createTodoAddTool,
  createTodoClearTool,
  createTodoCompleteTool,
  createTodoGetNextTool,
  createTodoGetTool,
  createTodoRemoveTool,
} from "./tools/built-in/todo";
export { createWebFetchTool } from "./tools/built-in/webfetch";
export type {
  WriteFileData,
  WriteFileToolConfig,
} from "./tools/built-in/write-file";
export { createWriteFileTool } from "./tools/built-in/write-file";

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
export type {
  ToolContext,
  ToolDefinition as ToolDef,
  ToolResult,
} from "./tools/tool.types";

export {
  clearTrash,
  listTrash,
  moveToTrash,
  restoreFromTrash,
  trashWorkspaceDir,
} from "./tools/io";
export type { QuestionRequester } from "./tools/tool.types";

export {
  getProviderSettings,
  ProviderArgumentsSchema,
  ConfigureProviderArgumentsSchema,
  AddCustomProviderArgumentsSchema,
  UpdateCustomProviderArgumentsSchema,
  CustomProviderModelArgumentsSchema,
  AddCustomProviderModelArgumentsSchema,
  CustomModelSettingsSchema,
  ProviderConfigurationSchema,
  RemoveCustomProviderOutputSchema,
  ProviderSettingsSchema,
  CustomProviderSettingsSchema,
  ProviderModelSettingsSchema,
  getProviderConfiguration,
  configureProvider,
  removeProviderCredential,
  addCustomProvider,
  updateCustomProvider,
  removeCustomProvider,
  addCustomProviderModel,
  removeCustomProviderModel,
  reloadProviderSettings,
} from "./model/providers/settings";
export type {
  ProviderSettings,
  CustomProviderSettings,
  ProviderConfiguration,
  AddCustomProviderOptions,
  UpdateCustomProviderOptions,
  AddCustomProviderModelOptions,
  CustomModelSettings,
} from "./model/providers/settings";
export {
  verifyProvider,
  supportsProviderVerification,
  ProviderVerificationSchema,
  VerifyProviderArgumentsSchema,
} from "./model/providers/verification";
export type {
  ProviderVerificationResult,
  ProviderVerificationStatus,
  VerifyProviderArguments,
  VerifyProviderOptions,
} from "./model/providers/verification";
export {
  getProviderSettingsPath,
  setProviderSettingsPath,
} from "./defaults/defaults";
export type { CredentialSource } from "./credentials";

export { ModelMetadataSchema } from "./model/providers/providers.schemas";
export type { ProviderModelMetadata } from "./model/providers/providers.types";

export {
  createProviderAuthentication,
  ProviderSignInArgumentsSchema,
  ProviderSignInAttemptArgumentsSchema,
  ProviderSignInStatusSchema,
  ProviderSignInStartSchema,
} from "./model/providers/authentication";
export type {
  ProviderAuthentication,
  ProviderSignInStatus,
} from "./model/providers/authentication";

export {
  ModelInfoSchema,
  ProviderInfoSchema,
  ModelSourceSchema,
  ProviderOriginSchema,
} from "./model/providers/providers.schemas";

export type {
  TinfoilPrivacyOptions,
  TinfoilMeasurementPins,
} from "./model/providers/tinfoil/tinfoil.types";
