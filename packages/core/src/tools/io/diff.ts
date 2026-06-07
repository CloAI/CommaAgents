import { createTwoFilesPatch } from "diff";

/**
 * Options for {@link unifiedDiff}.
 */
export interface UnifiedDiffOptions {
  /**
   * Path label used for both the `---` and `+++` headers in the diff.
   * Tools pass the workspace-relative path so the diff is portable.
   */
  readonly path: string;
  /**
   * Number of unchanged context lines on each side of a hunk.
   * @default 3
   */
  readonly contextLines?: number;
}

/**
 * Produce a unified diff (`diff -u` format) describing the transformation
 * from `before` to `after`.
 *
 * The output is suitable for:
 * - logging in audit entries,
 * - showing the LLM a confirmation of the edit it just made,
 * - feeding into review UIs.
 *
 * Returns an empty string when the inputs are byte-identical.
 */
export function unifiedDiff(
  before: string,
  after: string,
  options: UnifiedDiffOptions,
): string {
  if (before === after) return "";

  const patch = createTwoFilesPatch(
    options.path,
    options.path,
    before,
    after,
    undefined,
    undefined,
    { context: options.contextLines ?? 3 },
  );

  return patch;
}
