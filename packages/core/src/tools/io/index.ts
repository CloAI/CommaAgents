// Shared file-I/O primitives used by every file-editing tool.
//
// These modules are intentionally pure (no sandbox dependency) — the
// tool layer threads `sandbox.assertReadable` / `assertWritable`
// before invoking any function here. Tests can exercise the helpers
// directly against tmp dirs without touching the sandbox.

export type { WriteAtomicOptions } from "./atomic-write";
export { writeAtomic } from "./atomic-write";
export type { AuditEntry, AuditOperation, AuditSink } from "./audit";
export type { FileAuditSinkOptions } from "./audit-sink";
export { createFileAuditSink, createMemoryAuditSink } from "./audit-sink";
export { BINARY_DETECTION_SAMPLE_BYTES, isLikelyBinary } from "./binary";
export { applyBom, BOM, hasBom, stripBom } from "./bom";
export type { UnifiedDiffOptions } from "./diff";
export { unifiedDiff } from "./diff";
export { sha256OfBuffer, sha256OfFile } from "./hash";
export type { NewlineStyle } from "./newline";
export {
  applyNewline,
  detectNewline,
  toLF,
} from "./newline";
export { sandboxErrorToToolError } from "./sandbox-error";
export type { SessionFileEntry, SessionFileState } from "./session-file-state";
export {
  buildSessionFileState,
  verifySessionFileState,
} from "./session-file-state";
export { STALE_FILE_RECOVERY_HINT } from "./stale-file";
export type { GcTrashOptions } from "./trash";
export {
  DEFAULT_TRASH_MAX_AGE_MS,
  gcTrash,
  moveToTrash,
  trashWorkspaceDir,
} from "./trash";
