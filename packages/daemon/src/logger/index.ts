// Logger barrel — re-exports all public APIs.

// Core factory
export { createLogger } from "./logger";
export { createFileSink } from "./sinks/file";
// Sinks
export { createStderrSink, formatJsonLine } from "./sinks/stderr";
export { createSystemSink, describeSystemLogging } from "./sinks/system";
// Types
export type {
  CreateLoggerOptions,
  LogEntry,
  Logger,
  LogLevel,
  LogSink,
} from "./types";
export { LOG_LEVELS } from "./types";
