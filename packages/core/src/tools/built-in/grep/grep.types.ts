import type { FileSearchIssue } from "../../tool.types";

/** Host limits for content searches. */
export interface GrepToolConfig {
  /** Maximum matching lines returned. @default 100 */
  readonly maxResults?: number;
  /** Maximum directory traversal depth. @default 32 */
  readonly maxDepth?: number;
  /** Maximum file size read in bytes. @default 4194304 */
  readonly maxFileBytes?: number;
  /** Maximum formatted output size in UTF-8 bytes. @default 262144 */
  readonly maxOutputBytes?: number;
}

/** The first match on a matching line, with optional surrounding context. */
export interface GrepMatch {
  /** Workspace-relative file path. */
  readonly path: string;
  /** Matching line, numbered from one. */
  readonly line: number;
  /** First matching column, numbered from one. */
  readonly column: number;
  /** Matching line and requested context, with line numbers. */
  readonly preview: string;
}

/** Content matches and explicit reasons why a search could be incomplete. */
export interface GrepData {
  /** Matching lines in deterministic traversal order. */
  readonly matches: readonly GrepMatch[];
  /** Whether limits or inaccessible files prevented a complete search. */
  readonly truncated: boolean;
  /** Limits or inaccessible paths encountered during the search. */
  readonly incompleteReasons: readonly FileSearchIssue[];
}
