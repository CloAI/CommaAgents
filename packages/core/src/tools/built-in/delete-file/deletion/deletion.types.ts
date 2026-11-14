/** Recovery information recorded when a file is deleted. */
export interface DeletedFileMetadata {
  /** Deletion timestamp; field name retained for existing archives and protocol clients. */
  readonly trashedAt: string;
  /** Original workspace-relative file path. */
  readonly originalPath: string;
  /** SHA-256 of the original bytes. */
  readonly originalSha256: string;
  /** Original permission bits, absent in older archives. */
  readonly mode?: number;
  /** Session that deleted the file. */
  readonly sessionId?: string;
  /** Run that deleted the file. */
  readonly runId?: string;
  /** Agent that deleted the file. */
  readonly agentName?: string;
}
/** Run identity attached to recoverable deletions. */
export type SandboxDeletionMetadata = Pick<
  DeletedFileMetadata,
  "runId" | "sessionId"
>;
/** One recoverable deletion belonging to a workspace. */
export interface DeletedFileEntry {
  /** Absolute recovery archive path. */
  readonly path: string;
  /** Original file and execution identity. */
  readonly metadata: DeletedFileMetadata;
  /** Compressed archive size. */
  readonly sizeBytes: number;
}
/** Delete a file permanently or retain its original bytes for recovery. */
export interface DeleteFileOptions {
  /** Skip recovery storage. @default false */
  readonly permanent?: boolean;
  /** Execution identity to record with a recoverable deletion. */
  readonly metadata?: SandboxDeletionMetadata & { readonly agentName?: string };
}
/** Restore location and optional application-owned write authorization. */
export interface RestoreDeletedFileOptions {
  /** Workspace-relative override; otherwise restore the original path. */
  readonly targetPath?: string;
  /** Authorize the intended target before creating directories or writing bytes. */
  readonly authorize?: (path: string) => Promise<unknown>;
}
/** @internal Validated recovery archive ready for restoration. */
export interface DeletedFileArchive {
  readonly metadata: DeletedFileMetadata;
  readonly content: Buffer;
}
