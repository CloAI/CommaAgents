// @comma-agents/daemon
// Long-running process that executes agent flows and exposes a WebSocket API
// for clients (TUI, Web UI) to connect and interact.

export type {
  DaemonConfig,
  DaemonConfigFile,
  LoadConfigOptions,
} from "./config";
// -- Config --
export {
  DaemonConfigFileSchema,
  loadDaemonConfig,
  resolveDataDir,
} from "./config";
export type {
  CreateCredentialStoreOptions,
  Credential,
  CredentialBackend,
  CredentialStore,
  CredentialStoreData,
  EnvVarMap,
} from "./credentials";
// -- Credentials --
export {
  createCredentialStore,
  createJsonFileBackend,
  WELL_KNOWN_ENV_VARS,
} from "./credentials";
export type {
  AuthBridge,
  CreateAuthBridgeOptions,
  CreateInputBridgeOptions,
  CreateStrategyExecutorOptions,
  EventSink,
  InputBridge,
  ProviderResolver,
  StrategyExecutor,
} from "./executor";
// -- Executor --
export {
  createAuthBridge,
  createInputBridge,
  createStrategyExecutor,
  extractProviderIds,
} from "./executor";
export type {
  CreateLoggerOptions,
  LogEntry,
  Logger,
  LogLevel,
  LogSink,
} from "./logger";
// -- Logger --
export {
  createFileSink,
  createLogger,
  createStderrSink,
  createSystemSink,
  describeSystemLogging,
  formatJsonLine,
  LOG_LEVELS,
} from "./logger";
// -- PID --
export { isRunning, readPid, removePid, writePid } from "./pid";
// Shared types
export type {
  AgentCallResultWire,
  AgentStreamEventWire,
  ApiCredential,
  CustomCredential,
  ErrorInfo,
  OAuthCredential,
  RunSummary,
  Usage,
} from "./protocol";
// -- Protocol --
export {
  AgentCallResultSchema,
  AgentOutputMessage,
  AgentStreamEventSchema,
  AgentStreamingMessage,
  ApiCredentialSchema,
  // Shared schemas
  ClientBase,
  // Unions + parse helpers
  ClientMessage,
  CredentialSchema,
  CustomCredentialSchema,
  DaemonBase,
  DaemonMessage,
  ErrorInfoSchema,
  ErrorMessage,
  FlowCompletedMessage,
  FlowErrorMessage,
  FlowListMessage,
  // Daemon message schemas
  FlowStartedMessage,
  ListFlowsMessage,
  OAuthCredentialSchema,
  PingMessage,
  PongMessage,
  ProvideAuthMessage,
  parseClientMessage,
  parseDaemonMessage,
  RequestAuthMessage,
  RequestInputMessage,
  RunSummarySchema,
  // Client message schemas
  StartFlowMessage,
  StepCompletedMessage,
  StepStartedMessage,
  StopFlowMessage,
  SubscribeMessage,
  UnsubscribeMessage,
  UsageSchema,
  UserInputMessage,
} from "./protocol";
// -- Server --
export type { CreateDaemonOptions, Daemon } from "./server";
export { createDaemon } from "./server";
export type {
  DaemonState,
  RunState,
  RunStatus,
  RunUpdate,
} from "./state";
// -- State --
export { createDaemonState } from "./state";
