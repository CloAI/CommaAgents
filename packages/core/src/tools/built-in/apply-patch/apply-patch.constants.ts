/** Markers and defaults for the OpenAI `apply_patch` v2 envelope grammar. */

export const PATCH_BEGIN_MARKER = "*** Begin Patch";
export const PATCH_END_MARKER = "*** End Patch";
export const PATCH_ADD_FILE_PREFIX = "*** Add File: ";
export const PATCH_UPDATE_FILE_PREFIX = "*** Update File: ";
export const PATCH_DELETE_FILE_PREFIX = "*** Delete File: ";
export const PATCH_MOVE_FILE_PREFIX = "*** Move File: ";
export const PATCH_MOVE_ARROW = " -> ";
export const PATCH_HUNK_PREFIX = "@@";
export const PATCH_NO_NEWLINE_MARKER = "\\ No newline at end of file";

/** Suffix appended to staged tempfiles during atomic commit. */
export const PATCH_STAGING_SUFFIX = ".apply-patch.tmp";

/** Number of context lines emitted in the per-file diff output. */
export const PATCH_DEFAULT_DIFF_CONTEXT = 3;

/**
 * Sentinel value accepted in `expectedSha256ByPath` for `Add File`
 * entries — asserts the file is currently absent.
 */
export const PATCH_ADD_FILE_SENTINEL_SHA = "";
