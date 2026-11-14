import type { FileSearchIssue } from "../../tool.types";

/** Application limits for path discovery. */
export interface GlobToolConfig {
  /** Maximum returned matches. @default 1000 */
  readonly maxResults?: number;
  /** Maximum traversal depth. @default 32 */
  readonly maxDepth?: number;
  /** Maximum formatted text output in UTF-8 bytes. @default 262144 */
  readonly maxOutputBytes?: number;
}

/** Paths discovered by glob and any reasons the search is incomplete. */
export interface GlobData {
  /** Matched workspace-relative entries in deterministic traversal order. */
  readonly matches: readonly GlobMatch[];
  /** Whether any work or output was omitted. */
  readonly truncated: boolean;
  /** Reasons not all eligible paths were examined or returned. */
  readonly incompleteReasons: readonly FileSearchIssue[];
}

/** Minimal information needed to inspect a discovered entry. */
export interface GlobMatch {
  /** Workspace-relative path, directly usable by read_file. */
  readonly path: string;
  /** Entry kind; symlinks are not traversed. */
  readonly type: "file" | "directory" | "symlink";
}
