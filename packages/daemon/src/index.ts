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
  ErrorInfo,
  HandlerContext,
  MessageDispatcher,
  RequestResponseMap,
  RunSummary,
  Usage,
} from "./server/protocol";
// -- Protocol --
export {
  AgentCallResultSchema,
  AgentOutputMessage,
  AgentStreamEventSchema,
  AgentStreamingMessage,
  // Shared schemas
  ClientBase,
  // Unions + parse helpers
  ClientMessage,
  DaemonBase,
  DaemonMessage,
  ErrorInfoSchema,
  ErrorMessage,
  StrategyCompletedMessage,
  StrategyErrorMessage,
  StrategyListMessage,
  // Daemon message schemas
  StrategyStartedMessage,
  ListStrategiesMessage,
  PingMessage,
  PongMessage,
  parseClientMessage,
  parseDaemonMessage,
  RequestInputMessage,
  RunSummarySchema,
  // Client message schemas
  StartStrategyMessage,
  StepCompletedMessage,
  StepStartedMessage,
  StopStrategyMessage,
  SubscribeMessage,
  UnsubscribeMessage,
  UsageSchema,
  UserInputMessage,
} from "./server/protocol";
export { createDaemon } from "./server/server";
// -- Server --
export type { CreateDaemonOptions, Daemon } from "./server/server.types";
export type {
  DaemonState,
  RunState,
  RunStatus,
  RunUpdate,
} from "./state";
// -- State --
export { createDaemonState } from "./state";
