import type { AuditSink } from "../../io/audit";

export interface EditFileToolConfig {
  /**
   * Default audit sink to use when `ctx.auditSink` is undefined. Tests
   * typically pass `createMemoryAuditSink()` so they can assert on
   * audit entries; production callers should rely on the
   * `buildAgentToolSet` injection path.
   */
  readonly defaultAuditSink?: AuditSink;
}

export interface AppliedEdit {
  /** Index of the edit in the input array. */
  readonly editIndex: number;
  /** Number of occurrences replaced. */
  readonly occurrences: number;
}

export interface MatchRange {
  /** 1-indexed inclusive line where the match starts. */
  readonly startLine: number;
  /** 1-indexed inclusive line where the match ends. */
  readonly endLine: number;
  /** Logical (LF, no-BOM) character offset of match start. */
  readonly startOffset: number;
  /** Logical character offset of match end (exclusive). */
  readonly endOffset: number;
}

export interface EditFileData {
  /** Workspace-relative path (echoed). */
  readonly path: string;
  /** SHA-256 of the file's contents before the edits. */
  readonly beforeSha256: string;
  /** SHA-256 of the file's contents after the edits. */
  readonly afterSha256: string;
  /** Byte length of the post-edit content. */
  readonly sizeBytes: number;
  /** Per-edit application summary. */
  readonly appliedEdits: readonly AppliedEdit[];
  /** Unified diff from `before` → `after`. Empty string when unchanged. */
  readonly diff: string;
}
