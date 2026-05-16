export { createLogger } from "./logger";
export type {
  CreateLoggerOptions,
  LogEntry,
  Logger,
  LogLevel,
  LogSink,
} from "./logger.types";
export { createFileSink } from "./sinks/file";
export { createStderrSink } from "./sinks/stderr";
export { createSystemSink, describeSystemLogging } from "./sinks/system";
