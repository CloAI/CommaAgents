// Tools module barrel — single import point for tool internals.
// Public API is exported from the package index.

// Core types and factory
export { defineTool } from "./define/define-tool";
export type {
  AuditEntry,
  AuditOperation,
  AuditSink,
  FileAuditSinkOptions,
  NewlineStyle,
  SessionFileEntry,
  SessionFileState,
  UnifiedDiffOptions,
  WriteAtomicOptions,
} from "./io";

// File-I/O primitives (hash, binary detection, newline/BOM preservation,
// atomic write, unified diff, audit log, session file state).
export {
  applyBom,
  applyNewline,
  BINARY_DETECTION_SAMPLE_BYTES,
  BOM,
  buildSessionFileState,
  createFileAuditSink,
  createMemoryAuditSink,
  detectNewline,
  hasBom,
  isLikelyBinary,
  STALE_FILE_RECOVERY_HINT,
  sha256OfBuffer,
  sha256OfFile,
  stripBom,
  toLF,
  unifiedDiff,
  verifySessionFileState,
  writeAtomic,
} from "./io";
// Result helpers
export { errorResult, okResult, toolError } from "./result";

// Tool registry
export {
  getRegisteredToolNames,
  registerTool,
  resetToolRegistry,
  resolveTools,
  unregisterTool,
} from "./tool.registry";

export type {
  ToolContext,
  ToolDefinition as ToolDef,
  ToolError,
  ToolErrorKind,
  ToolResult,
} from "./tool.types";
