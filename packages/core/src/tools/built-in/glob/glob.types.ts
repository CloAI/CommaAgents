export interface GlobToolConfig {
  /**
   * Maximum number of matches returned. Excess entries are dropped and
   * `data.truncated` is set. Default: 1000.
   */
  readonly maxResults?: number;
  /**
   * Maximum depth of directory traversal. Default: 32.
   */
  readonly maxDepth?: number;
}

export interface GlobData {
  /** Glob pattern that was matched. */
  readonly pattern: string;
  /** Root directory that was searched (echoed input, normalized). */
  readonly root: string;
  /** Matched paths and details. */
  readonly matches: readonly GlobMatch[];
  /** True when the result was capped by `maxResults`. */
  readonly truncated: boolean;
}

export interface GlobMatch {
  /** Path relative to the workspace. */
  readonly path: string;
  /** Entry kind. */
  readonly type: "file" | "directory" | "symlink";
  /** Size in bytes. `0` for directories and symlinks. */
  readonly size: number;
  /** ISO-8601 modification timestamp. */
  readonly mtime: string;
}
