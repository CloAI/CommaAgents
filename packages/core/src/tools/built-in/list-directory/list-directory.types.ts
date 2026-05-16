export interface ListDirectoryToolConfig {
  /**
   * Hard cap on recursion depth. Calls passing a larger `maxDepth` are
   * clamped to this value. Default: 32.
   */
  readonly absoluteMaxDepth?: number;
  /**
   * Default `maxDepth` when `recursive: true` is set without an explicit
   * depth. Default: 8.
   */
  readonly defaultRecursiveDepth?: number;
  /**
   * Maximum number of entries returned. Excess entries are dropped and
   * `data.truncated` is set. Default: 5000.
   */
  readonly maxEntries?: number;
}

export interface ListDirectoryData {
  /** Directory that was listed (echoed input, normalized). */
  readonly path: string;
  /** Sorted entries. */
  readonly entries: readonly ListDirectoryEntry[];
  /** Effective recursion depth used for this call. */
  readonly maxDepth: number;
  /** True when the result was capped by `maxEntries`. */
  readonly truncated: boolean;
}

export interface ListDirectoryEntry {
  /** Basename of the entry. */
  readonly name: string;
  /** Path relative to the listed directory (forward-slash separated). */
  readonly relativePath: string;
  /** Entry kind. */
  readonly type: "file" | "directory" | "symlink";
  /** Size in bytes. `0` for directories and symlinks. */
  readonly size: number;
  /** ISO-8601 modification timestamp. */
  readonly mtime: string;
  /** Depth below the listed directory (1 = direct child). */
  readonly depth: number;
}
