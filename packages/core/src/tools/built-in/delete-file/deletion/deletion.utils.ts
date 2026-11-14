import { createHash } from "node:crypto";
import { lstat, readFile, realpath } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { gunzipSync, gzipSync } from "node:zlib";
import { extract, pack } from "tar-stream";
import { z } from "zod";
import type { DeletedFileArchive, DeletedFileMetadata } from "./deletion.types";

const metadataSchema = z.object({
  trashedAt: z.string().datetime(),
  originalPath: z.string().min(1),
  originalSha256: z.string().regex(/^[a-f0-9]{64}$/),
  mode: z.number().int().min(0).max(0o777).optional(),
  sessionId: z.string().optional(),
  runId: z.string().optional(),
  agentName: z.string().optional(),
});

/** Resolve an owned workspace path, checking existing ancestors for symlink escapes.
 * @param {string} workspaceRoot - Owning workspace.
 * @param {string} path - File path to validate.
 * @returns {Promise<string>} Canonical workspace-relative destination.
 * @internal
 */
export async function workspaceFile(
  workspaceRoot: string,
  path: string,
): Promise<string> {
  const root = await realpath(workspaceRoot);
  const requestedRoot = resolve(workspaceRoot);
  const local = relative(requestedRoot, resolve(requestedRoot, path));
  const absolute = resolve(root, local);
  if (
    !local ||
    local === ".." ||
    local.startsWith(`..${sep}`) ||
    isAbsolute(local)
  ) {
    throw Object.assign(new Error(`File target escapes workspace: ${path}`), {
      code: "OUTSIDE_WORKSPACE",
    });
  }
  let ancestor = dirname(absolute);
  while (true) {
    try {
      const actual = await realpath(ancestor);
      if (!(await lstat(actual)).isDirectory()) {
        throw Object.assign(new Error("Restore parent is not a directory."), {
          code: "ENOTDIR",
        });
      }
      const localAncestor = relative(root, actual);
      if (
        localAncestor === ".." ||
        localAncestor.startsWith(`..${sep}`) ||
        isAbsolute(localAncestor)
      ) {
        throw Object.assign(
          new Error(`File target escapes workspace: ${path}`),
          { code: "OUTSIDE_WORKSPACE" },
        );
      }
      break;
    } catch (error) {
      if (
        !(error instanceof Error) ||
        !("code" in error) ||
        error.code !== "ENOENT"
      ) {
        throw error;
      }
      ancestor = dirname(ancestor);
    }
  }
  return absolute;
}

/** Pack one file with metadata; a fixed payload name avoids collisions with metadata.json.
 * @param {DeletedFileMetadata} metadata - Original file identity and permissions.
 * @param {Buffer} content - Original file bytes.
 * @returns {Promise<Buffer>} Compressed recovery archive.
 * @internal
 */
export async function encodeDeletedFile(
  metadata: DeletedFileMetadata,
  content: Buffer,
): Promise<Buffer> {
  const archive = pack();
  archive.entry(
    { name: "metadata.json", mode: 0o600 },
    JSON.stringify(metadata),
  );
  archive.entry({ name: "content", mode: metadata.mode ?? 0o600 }, content);
  archive.finalize();
  const chunks: Buffer[] = [];
  for await (const chunk of archive) {
    chunks.push(Buffer.from(chunk as Uint8Array));
  }
  return gzipSync(Buffer.concat(chunks));
}

/** Read only an archive owned by this bucket, validating metadata, payload and hash before use.
 * @param {string} bucket - Owning recovery directory.
 * @param {string} archivePath - Archive to validate and read.
 * @returns {Promise<DeletedFileArchive>} Validated metadata and file bytes.
 * @internal
 */
export async function readDeletedFile(
  bucket: string,
  archivePath: string,
): Promise<DeletedFileArchive> {
  if (
    dirname(resolve(archivePath)) !== resolve(bucket) ||
    !(await lstat(archivePath)).isFile() ||
    (await realpath(dirname(archivePath))) !== (await realpath(bucket))
  ) {
    throw Object.assign(
      new Error("Recovery archive does not belong to this workspace."),
      { code: "OUTSIDE_WORKSPACE" },
    );
  }
  try {
    const archive = extract();
    archive.end(gunzipSync(await readFile(archivePath)));
    let metadata: DeletedFileMetadata | undefined;
    let content: Buffer | undefined;
    for await (const entry of archive) {
      const chunks: Buffer[] = [];
      for await (const chunk of entry) {
        chunks.push(Buffer.from(chunk as Uint8Array));
      }
      const bytes = Buffer.concat(chunks);
      if (!metadata && entry.header.name === "metadata.json") {
        metadata = metadataSchema.parse(JSON.parse(bytes.toString("utf8")));
      } else if (
        metadata &&
        (entry.header.name === "content" ||
          entry.header.name === metadata.originalPath)
      ) {
        if (content !== undefined || entry.header.type !== "file") {
          throw new Error("Duplicate or invalid file entry.");
        }
        content = bytes;
      }
    }
    if (
      !metadata ||
      content === undefined ||
      createHash("sha256").update(content).digest("hex") !==
        metadata.originalSha256
    ) {
      throw new Error("Missing file content or hash mismatch.");
    }
    return { metadata, content };
  } catch {
    throw Object.assign(
      new Error(
        "Recovery archive metadata or file content is missing or corrupted.",
      ),
      { code: "INVALID_ARCHIVE" },
    );
  }
}
