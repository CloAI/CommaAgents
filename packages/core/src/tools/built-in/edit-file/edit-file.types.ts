import type { AuditSink } from "../../io/audit.types";

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
  /**
   * True when the exact substring match failed and a fallback replacer
   * recovered the edit (line-trimmed, whitespace-normalized, or block
   * anchor). Surfaces in the tool's text output so the LLM can spot when
   * its `oldText` was approximate and tighten it next time.
   */
  readonly usedFallback?: boolean;
  /**
   * Name of the replacer that produced the match. Always present;
   * `"exactReplacer"` for the strict path.
   */
  readonly replacerName?: string;
  /**
   * The actual substring of the file that was matched and replaced.
   * Populated only when a fallback was used so the caller can show the
   * LLM exactly what got swapped (the LLM's `oldText` is approximate by
   * definition in that case).
   */
  readonly matchedText?: string;
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
