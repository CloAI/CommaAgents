import { z } from "zod";

export const deleteFileParams = z.object({
  path: z
    .string()
    .min(1)
    .describe(
      "Workspace-relative path of the file to delete. Absolute paths are rejected unless " +
        "the sandbox is configured with `allowAbsolutePaths: true`.",
    ),
  expectedSha256: z
    .string()
    .length(64)
    .regex(
      /^[0-9a-f]{64}$/,
      "expectedSha256 must be a 64-character lowercase hex string",
    )
    .describe(
      "SHA-256 of the file's current on-disk bytes, as returned by `read_file`. " +
        "Required to detect concurrent edits — a mismatch yields `stale_file`.",
    ),
  permanent: z
    .boolean()
    .optional()
    .describe(
      "When true, the file is unlinked directly with no recovery path. When false (default), " +
        "the file is moved to a workspace-scoped trash bucket under the OS temp directory.",
    ),
});
