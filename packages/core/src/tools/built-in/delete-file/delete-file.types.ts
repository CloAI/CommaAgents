import type { AuditSink } from "../../io/audit";

/** Configuration for `delete_file`. */
export interface DeleteFileToolConfig {
  /** Default audit sink when `toolContext.auditSink` is undefined. */
  readonly defaultAuditSink?: AuditSink;
}

/** Structured payload returned by `delete_file`. */
export interface DeleteFileData {
  /** Always `true` on success. */
  readonly deleted: true;
  /** Workspace-relative path of the deleted file (echoed). */
  readonly path: string;
  /** SHA-256 of the file's content at deletion time. */
  readonly beforeSha256: string;
  /** Byte length of the deleted content. */
  readonly sizeBytes: number;
  /** Unified diff from file → /dev/null. */
  readonly diff: string;
  /**
   * Absolute path of the trash entry, when the delete was recoverable.
   * Omitted when `permanent: true`.
   */
  readonly trashedTo?: string;
  /** Whether the delete was permanent (no recovery). */
  readonly permanent: boolean;
}
