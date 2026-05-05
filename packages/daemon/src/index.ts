// @comma-agents/daemon
// Long-running process that executes agent strategies and exposes a WebSocket API
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
  CreateInputBridgeOptions,
  CreateStrategyExecutorOptions,
  EventSink,
  InputBridge,
  ProviderResolver,
  StrategyExecutor,
} from "./executor";
// -- Executor --
export {
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
  ClientMessage,
  DaemonMessage,
  ErrorInfo,
  HandlerContext,
  MessageDispatcher,
  RequestResponseMap,
  RunSummary,
  Usage,
  SessionMetadataWire,
  SessionTurnWire,
  SessionRunSummaryWire,
} from "./server/protocol";
export {
  parseClientMessage,
  parseDaemonMessage,
} from "./server/protocol";
// -- State --
export type { RunStatus } from "./state";
// -- Sessions --
export type {
  CreateSessionStoreOptions,
  PersistedSession,
  SessionMetadata,
  SessionRunSummary,
  SessionStore,
  SessionTurn,
} from "./sessions";
export {
  createSessionStore,
  hashCwd,
  normalizeCwd,
  SESSION_SCHEMA_VERSION,
} from "./sessions";
