export { createDaemonKernel } from "./daemon-kernel";
export { createPlugin, defineCommand, defineChannel } from "../daemon-plugin";
export type {
  CreatePluginOptions,
  CommandContext,
  ChannelMessage,
  ChannelContext,
  ChannelOpenResult,
  BindingError,
  PluginServer,
  PluginServerDefinitions,
} from "../daemon-plugin";
export type {
  DaemonStatus,
  StatusPlugin,
  StatusNotifications,
} from "../plugins/status";
export type {
  CreateDaemonKernelOptions,
  DaemonKernel,
  DaemonPlugins,
} from "./daemon-kernel.types";
export { createRunsPlugin } from "../plugins/runs";
export type {
  RunHistoryOptions,
  RunHistoryPage,
  RunContent,
  RunMessage,
  RunHistoryEntry,
  ChildRunEntry,
  RunsChannelMessage,
  CreateRunsPluginOptions,
  PrepareRunOptions as PluginPrepareRunOptions,
  PrepareRunResult as PluginPrepareRunResult,
  RunExecutionHandle,
  RunOutcome,
  RunIdentity,
  RunPreparationContext,
  RunPreparationRegistration,
  RunPreparationResult,
  RunResultSummary,
  RunSnapshot as PluginRunSnapshot,
  RunsPlugin,
  RunStatus,
  RunNotifications,
  RunSnapshotStatus,
  RunInputRequestStatus,
  RunStepStatus,
  RunSteerQueuedStatus,
  StrategyHookContext,
  StrategyHookRegistration,
  StrategyLoaderInputs,
} from "../plugins/runs";
export type {
  Plugin,
  NotifyingPlugin,
  PluginSubscriptions,
  NotificationListener,
} from "../daemon-plugin";
export { createSandboxPlugin } from "../plugins/sandbox";
export { createQuestionsPlugin } from "../plugins/questions";
export { createSkillsPlugin } from "../plugins/skills";
export { createMcpPlugin } from "../plugins/mcp";
export { createLspPlugin } from "../plugins/lsp";
export type {
  CreateLspPluginOptions,
  LspPlugin,
  LspProcessPhase,
  LspProcessStatus,
} from "../plugins/lsp";
export type {
  CreateMcpPluginOptions,
  McpPlugin,
  RunMcpServerStatus,
  ListMcpServersOptions,
  UpdateMcpServerOptions,
  McpNotifications,
  McpServersUpdated,
} from "../plugins/mcp";
export type {
  CreateSkillsPluginOptions,
  SkillsPlugin,
  SkillsWorkspaceOptions,
  SkillsListResult,
  RunSkillsResult,
} from "../plugins/skills";
export type {
  CreateQuestionsPluginOptions,
  QuestionsPlugin,
  QuestionsSubmissionResult,
  QuestionsNotifications,
  QuestionRequested,
} from "../plugins/questions";
export type {
  CreateSandboxPluginOptions,
  SandboxPlugin,
  SandboxStatus,
  SandboxNotifications,
  SandboxPermissionRequest,
  SandboxPolicyUpdate,
} from "../plugins/sandbox";

export {
  RunPhase,
  RunOutcomeStatus,
  RunErrorCode,
  RunMessageStatus,
  RunToolStatus,
} from "../plugins/runs";
export type {
  RunConfiguration,
  NewRunConfiguration,
  RunConfigurationOverrides,
  RunStrategyDescription,
  RunPreparingSnapshot,
  RunPreparedSnapshot,
  RunRunningSnapshot,
  RunTerminalSnapshot,
  RunTerminalOutcome,
} from "../plugins/runs";

export { createCorePlugin } from "../plugins/core";
export type { CorePlugin, ProvidersSnapshot } from "../plugins/core";

export { createProjectsPlugin, GENERAL_PROJECT_ID } from "../plugins/projects";
export type { ProjectsPlugin, Project, ProjectChat, ProjectChatStatus, ProjectCatalog, CreateProjectOptions, CreateProjectResult, CreateProjectsPluginOptions, ChatAttention, ProjectArchivePage, AssignProjectChatOptions, ProjectActivityOptions, ArchiveProjectChatOptions, SearchProjectArchiveOptions } from "../plugins/projects";
