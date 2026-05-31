/**
 * The kind of destructive file operation an audit entry records.
 *
 * - `"create"` — file did not exist before (or was a move target with
 *   no prior content).
 * - `"update"` — file existed and was modified in place.
 * - `"delete"` — file existed and was removed (or trashed).
 * - `"move"`   — `path` is the source, `toPath` the destination.
 *   `beforeSha256` is the source's pre-move hash; `afterSha256` is the
 *   destination's hash (typically identical to `beforeSha256` for a
 *   plain rename, but recorded explicitly to handle copy-then-delete
 *   moves across filesystems).
 */
export type AuditOperation = "create" | "update" | "delete" | "move";

/**
 * One row in the audit log. Persisted as a single JSONL line.
 *
 * Fields are typed as `readonly` because audit entries are immutable
 * once appended — replaying the log must produce identical state
 * regardless of how many times it runs.
 */
export interface AuditEntry {
  /** ISO-8601 timestamp (UTC) when the operation completed. */
  readonly timestamp: string;
  /**
   * Session identifier from `ToolContext.sessionId`. Omitted for
   * non-session callers (in-memory sink only).
   */
  readonly sessionId?: string;
  /** Name of the agent that invoked the tool. */
  readonly agentName: string;
  /** Name of the tool that produced the mutation. */
  readonly toolName: string;
  /** Which kind of mutation this entry records. */
  readonly operation: AuditOperation;
  /**
   * Workspace-relative path of the target. For `"move"`, this is the
   * source path; for everything else, the affected file.
   */
  readonly path: string;
  /** Destination path for `"move"` operations. Omitted otherwise. */
  readonly toPath?: string;
  /**
   * SHA-256 of the file's content before the operation. Omitted for
   * `"create"`. For `"delete"`, this is the hash at deletion time.
   */
  readonly beforeSha256?: string;
  /**
   * SHA-256 of the file's content after the operation. Omitted for
   * `"delete"`. For `"create"` / `"update"` / `"move"`, this is the
   * hash of the newly-written content.
   */
  readonly afterSha256?: string;
  /**
   * Unified diff in standard `diff -u` format. Optional — omitted for
   * `"create"` (no prior content) and `"delete"` (no resulting content).
   * Truncated by the sink if it exceeds the sink's configured limit.
   */
  readonly diff?: string;
  /**
   * `true` if the operation completed successfully. Failed operations
   * are still recorded (for forensics and to keep replay deterministic)
   * but their hash fields will reflect the pre-operation state.
   */
  readonly success: boolean;
  /**
   * Human-readable error message when `success` is false. Structured
   * `ToolError` is *not* serialized — the message is enough for replay
   * and the structured form is already on the `ToolResult`.
   */
  readonly error?: string;
  /**
   * Optional tool-specific metadata that doesn't fit the common fields.
   * Examples: `{ trashedTo }` for `delete_file`, `{ overwrote: true }`
   * for `move_file`, `{ atomic: true, hunkCount: 5 }` for `apply_patch`.
   *
   * Implementations must JSON-serialize this verbatim — keep it simple
   * (strings, numbers, booleans, plain objects/arrays).
   */
  readonly details?: Readonly<Record<string, unknown>>;
}

/**
 * Storage interface for audit entries.
 *
 * Implementations:
 * - `createFileAuditSink(workspaceRoot)` — JSONL at
 *   `<workspaceRoot>/.comma/audit/<sessionId>.jsonl`.
 * - `createMemoryAuditSink()` — in-memory array, for tests and for
 *   non-session callers.
 *
 * The sink is responsible for its own durability guarantees. File
 * sinks fsync per-append; the in-memory sink simply pushes.
 */
export interface AuditSink {
  /**
   * Append a single entry. Resolves once the entry is durable (for
   * file sinks) or stored (for the in-memory sink).
   */
  append(entry: AuditEntry): Promise<void>;
  /**
   * Return entries for `sessionId`, or all entries when `sessionId`
   * is omitted. Order matches insertion order (oldest → newest).
   *
   * File sinks read from disk on every call — callers that need
   * repeated access should cache the result.
   */
  list(sessionId?: string): Promise<readonly AuditEntry[]>;
  /**
   * Load a specific session's entries. Equivalent to
   * `list(sessionId)` but signals intent ("hydrate this session")
   * and may use a different code path for file sinks (e.g. open
   * the specific JSONL file directly).
   */
  load(sessionId: string): Promise<readonly AuditEntry[]>;
}
