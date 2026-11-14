import { createHash, randomUUID } from "node:crypto";
import {
  lstat,
  mkdir,
  open,
  readFile,
  readdir,
  realpath,
  rm,
  unlink,
} from "node:fs/promises";
import { basename, dirname, join, relative, resolve } from "node:path";
import { getApplicationDataDirectory } from "../../../../defaults/defaults";
import {
  encodeDeletedFile,
  readDeletedFile,
  workspaceFile,
} from "./deletion.utils";
import type {
  DeletedFileEntry,
  DeleteFileOptions,
  RestoreDeletedFileOptions,
} from "./deletion.types";

/** Return a workspace's recovery directory, including archives made by older versions.
 * @param {string} workspaceRoot - Absolute workspace root.
 * @returns {string} Recovery directory belonging to the workspace.
 * @example const directory = getDeletedFilesDirectory(workspaceRoot);
 */
export function getDeletedFilesDirectory(workspaceRoot: string): string {
  return join(
    getApplicationDataDirectory(),
    "trash",
    createHash("sha256").update(workspaceRoot).digest("hex"),
  );
}

/** Delete a regular workspace file, retaining its bytes unless permanent deletion is requested.
 * @param {string} workspaceRoot - Workspace owning the file.
 * @param {string} path - File to delete.
 * @param {DeleteFileOptions} options - Permanent deletion or execution metadata.
 * @returns {Promise<{archivePath?: string}>} Archive path, omitted for permanent deletion.
 * @example const { archivePath } = await deleteFile(workspaceRoot, "src/old.ts");
 */
export async function deleteFile(
  workspaceRoot: string,
  path: string,
  options: DeleteFileOptions = {},
): Promise<{ readonly archivePath?: string }> {
  const absolute = await workspaceFile(workspaceRoot, path);
  const source = await lstat(absolute);
  if (!source.isFile()) {
    throw new Error("Only regular files can be deleted.");
  }
  if (options.permanent) {
    await unlink(absolute);
    return {};
  }
  const content = await readFile(absolute);
  const bucket = getDeletedFilesDirectory(workspaceRoot);
  await mkdir(bucket, { recursive: true, mode: 0o700 });
  const archivePath = join(
    bucket,
    `${Date.now()}-${randomUUID()}-${basename(absolute)}.tar.gz`,
  );
  const root = await realpath(workspaceRoot);
  const archive = await encodeDeletedFile(
    {
      ...options.metadata,
      trashedAt: new Date().toISOString(),
      originalPath: relative(root, absolute),
      originalSha256: createHash("sha256").update(content).digest("hex"),
      mode: source.mode & 0o777,
    },
    content,
  );
  const handle = await open(archivePath, "wx", 0o600);
  try {
    await handle.writeFile(archive);
    await handle.sync();
  } catch (error) {
    await rm(archivePath, { force: true });
    throw error;
  } finally {
    await handle.close();
  }
  try {
    await unlink(absolute);
  } catch (error) {
    await rm(archivePath, { force: true });
    throw error;
  }
  return { archivePath };
}

/** Restore a validated deleted file without replacing an existing destination.
 * @param {string} workspaceRoot - Workspace owning the archive and target.
 * @param {string} archivePath - Archive returned by deleteFile or listDeletedFiles.
 * @param {RestoreDeletedFileOptions} options - Optional restore path and write authorization.
 * @returns {Promise<string>} Restored absolute file path.
 * @example await restoreDeletedFile(workspaceRoot, archivePath);
 */
export async function restoreDeletedFile(
  workspaceRoot: string,
  archivePath: string,
  options: RestoreDeletedFileOptions = {},
): Promise<string> {
  const { metadata, content } = await readDeletedFile(
    getDeletedFilesDirectory(workspaceRoot),
    archivePath,
  );
  const target = options.targetPath ?? metadata.originalPath;
  const absolute = await workspaceFile(workspaceRoot, target);
  if (options.authorize) {
    await options.authorize(target);
  }
  await mkdir(dirname(absolute), { recursive: true });
  await workspaceFile(workspaceRoot, target);
  const handle = await open(absolute, "wx", metadata.mode ?? 0o600);
  try {
    await handle.writeFile(content);
    if (metadata.mode !== undefined) {
      await handle.chmod(metadata.mode);
    }
    await handle.sync();
  } catch (error) {
    await rm(absolute, { force: true });
    throw error;
  } finally {
    await handle.close();
  }
  await unlink(archivePath);
  return resolve(workspaceRoot, target);
}

/** List valid recoverable deletions for one workspace.
 * @param {string} workspaceRoot - Workspace whose deleted files should be listed.
 * @returns {Promise<readonly DeletedFileEntry[]>} Valid workspace-owned recovery entries.
 * @example const deleted = await listDeletedFiles(workspaceRoot);
 */
export async function listDeletedFiles(
  workspaceRoot: string,
): Promise<readonly DeletedFileEntry[]> {
  const bucket = getDeletedFilesDirectory(workspaceRoot);
  const entries: DeletedFileEntry[] = [];
  let names: string[];
  try {
    names = await readdir(bucket);
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return [];
    }
    throw error;
  }
  for (const name of names) {
    if (!name.endsWith(".tar.gz")) {
      continue;
    }
    const path = join(bucket, name);
    try {
      const { metadata } = await readDeletedFile(bucket, path);
      entries.push({ path, metadata, sizeBytes: (await lstat(path)).size });
    } catch {
      /* A malformed archive is retained for manual recovery. */
    }
  }
  return entries;
}

/** Permanently clear a workspace's recovery directory.
 * @param {string} workspaceRoot - Workspace whose recovery files should be removed.
 * @returns {Promise<{cleared: number, bytesFreed: number}>} Removed archive count and compressed bytes.
 * @example const { cleared } = await clearDeletedFiles(workspaceRoot);
 */
export async function clearDeletedFiles(
  workspaceRoot: string,
): Promise<{ cleared: number; bytesFreed: number }> {
  const bucket = getDeletedFilesDirectory(workspaceRoot);
  let names: string[];
  try {
    names = await readdir(bucket);
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return { cleared: 0, bytesFreed: 0 };
    }
    throw error;
  }
  let cleared = 0;
  let bytesFreed = 0;
  for (const name of names) {
    if (!name.endsWith(".tar.gz")) {
      continue;
    }
    const file = await lstat(join(bucket, name)).catch(() => undefined);
    if (file?.isFile()) {
      cleared++;
      bytesFreed += file.size;
    }
  }
  await rm(bucket, { recursive: true, force: true });
  return { cleared, bytesFreed };
}
