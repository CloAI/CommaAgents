// Workspace trash helpers.
//
// Recoverable deletions are stored as tar.gz archives in a persistent
// data directory. Each archive preserves the file's workspace-relative
// path and includes a metadata.json entry with audit information
// (sessionId, runId, agentName, timestamp, original path, sha256).
//
// Layout:
//   <resolveDataDir()>/trash/<sha256(workspaceRoot)>/<timestamp>-<sessionId>-<runId>-<basename>.tar.gz
//
// Archive contents:
//   metadata.json  — { sessionId, runId, agentName, trashedAt, originalPath, originalSha256 }
//   <relativePath> — the original file at its workspace-relative path
//
// No automatic garbage collection — trash is user-managed via
// `listTrash`, `restoreFromTrash`, and `clearTrash`.

import { createHash } from "node:crypto";
import {
  mkdir,
  readdir,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { basename, dirname, join, relative } from "node:path";
import { gunzipSync, gzipSync } from "node:zlib";
import extract from "tar-stream/extract";
import pack from "tar-stream/pack";
import { resolveDataDir } from "../../credentials/credentials.utils";

/** Metadata stored inside each trash archive. */
export interface TrashMetadata {
  readonly trashedAt: string;
  readonly originalPath: string;
  readonly originalSha256: string;
  readonly sessionId?: string;
  readonly runId?: string;
  readonly agentName?: string;
}

/** Subset of TrashMetadata injected by the daemon executor into the sandbox config. */
export type SandboxTrashMetadata = Pick<TrashMetadata, "runId" | "sessionId">;

/** A single trash entry returned by `listTrash`. */
export interface TrashEntry {
  readonly path: string;
  readonly metadata: TrashMetadata;
  readonly sizeBytes: number;
}

/**
 * Compute the trash bucket directory for `workspaceRoot`.
 */
export function trashWorkspaceDir(workspaceRoot: string): string {
  const key = createHash("sha256").update(workspaceRoot).digest("hex");
  return join(resolveDataDir(), "trash", key);
}

function shortHash(input: string, length: number): string {
  return createHash("sha256").update(input).digest("hex").slice(0, length);
}

/**
 * Move `absSourcePath` into the workspace's trash bucket as a tar.gz
 * archive, returning the absolute path to the archive.
 *
 * The archive contains:
 * - `metadata.json` with audit information
 * - The original file at its workspace-relative path
 */
export async function moveToTrash(
  workspaceRoot: string,
  absSourcePath: string,
  metadata?: Omit<
    TrashMetadata,
    "trashedAt" | "originalPath" | "originalSha256"
  >,
): Promise<string> {
  const bucket = trashWorkspaceDir(workspaceRoot);
  await mkdir(bucket, { recursive: true });

  const relativePath = relative(workspaceRoot, absSourcePath);
  const content = await readFile(absSourcePath);
  const contentBuffer = Buffer.from(content);
  const sha256 = createHash("sha256").update(content).digest("hex");

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const sessionPart = metadata?.sessionId
    ? `${shortHash(metadata.sessionId, 8)}-`
    : "";
  const runPart = metadata?.runId ? `${shortHash(metadata.runId, 8)}-` : "";
  const randomSuffix =
    !sessionPart && !runPart
      ? `${Math.random().toString(36).slice(2, 8)}-`
      : "";
  const archiveName = `${stamp}-${sessionPart}${runPart}${randomSuffix}${basename(absSourcePath)}.tar.gz`;
  const archivePath = join(bucket, archiveName);

  const metaEntry: TrashMetadata = {
    trashedAt: new Date().toISOString(),
    originalPath: relativePath,
    originalSha256: sha256,
    sessionId: metadata?.sessionId,
    runId: metadata?.runId,
    agentName: metadata?.agentName,
  };

  const metaBuffer = Buffer.from(JSON.stringify(metaEntry, null, 2), "utf-8");

  const packed = await new Promise<Buffer>((resolve, reject) => {
    const p = pack();
    const chunks: Buffer[] = [];

    p.on("error", reject);
    p.on("data", (chunk: Buffer) => chunks.push(chunk));
    p.on("end", () => resolve(Buffer.concat(chunks)));

    p.entry(
      { name: "metadata.json", mode: 0o644, size: metaBuffer.length },
      metaBuffer,
    );
    p.entry(
      { name: relativePath, mode: 0o644, size: contentBuffer.length },
      contentBuffer,
    );
    p.finalize();
  });

  const compressed = gzipSync(packed);
  await writeFile(archivePath, new Uint8Array(compressed));

  try {
    await rm(absSourcePath, { force: true });
  } catch {
    await rm(archivePath, { force: true });
    throw new Error(
      `Failed to remove source file after archiving: ${absSourcePath}`,
    );
  }

  return archivePath;
}

/**
 * List all trash entries for a workspace.
 */
export async function listTrash(
  workspaceRoot: string,
): Promise<readonly TrashEntry[]> {
  const bucket = trashWorkspaceDir(workspaceRoot);
  let entries: string[];
  try {
    entries = await readdir(bucket);
  } catch {
    return [];
  }

  const results: TrashEntry[] = [];

  for (const name of entries) {
    if (!name.endsWith(".tar.gz")) continue;
    const full = join(bucket, name);

    try {
      const fileStat = await stat(full);
      const metaResult = await readTrashMetadata(full);

      if (!metaResult) continue;

      results.push({
        path: full,
        metadata: metaResult,
        sizeBytes: fileStat.size,
      });
    } catch {}
  }

  return results;
}

/**
 * Read the metadata.json from a trash archive without extracting files.
 */
async function readTrashMetadata(
  archivePath: string,
): Promise<TrashMetadata | undefined> {
  try {
    const compressed = await readFile(archivePath);
    const decompressed = gunzipSync(compressed);

    return await new Promise<TrashMetadata | undefined>((resolve, _reject) => {
      const ext = extract();
      let found: TrashMetadata | undefined;

      ext.on("entry", (header, stream, next) => {
        if (header.name === "metadata.json") {
          const chunks: Buffer[] = [];
          stream.on("data", (chunk: Buffer) => chunks.push(chunk));
          stream.on("end", () => {
            try {
              found = JSON.parse(Buffer.concat(chunks).toString("utf-8"));
            } catch {
              // corrupted metadata — ignore
            }
            next();
          });
          stream.on("error", () => next());
        } else {
          stream.resume();
          stream.on("end", next);
          stream.on("error", () => next());
        }
      });

      ext.on("finish", () => resolve(found));
      ext.on("error", () => resolve(undefined));

      ext.end(Buffer.from(decompressed));
    });
  } catch {
    return undefined;
  }
}

/**
 * Restore a file from a trash archive.
 *
 * @param workspaceRoot - Workspace root directory.
 * @param trashPath - Absolute path to the .tar.gz trash archive.
 * @param targetPath - Optional workspace-relative override for the restore location.
 *   Defaults to the original path from metadata.
 * @returns The absolute path of the restored file.
 */
export async function restoreFromTrash(
  workspaceRoot: string,
  trashPath: string,
  targetPath?: string,
): Promise<string> {
  const metadata = await readTrashMetadata(trashPath);
  if (!metadata) {
    throw new Error(`Could not read metadata from trash archive: ${trashPath}`);
  }

  const restoreRelative = targetPath ?? metadata.originalPath;
  const restoreAbsolute = join(workspaceRoot, restoreRelative);

  await mkdir(dirname(restoreAbsolute), { recursive: true });

  const compressed = await readFile(trashPath);
  const decompressed = gunzipSync(compressed);

  await new Promise<void>((resolve, reject) => {
    const ext = extract();

    ext.on("entry", (header, stream, next) => {
      if (header.name === metadata.originalPath) {
        const chunks: Buffer[] = [];
        stream.on("data", (chunk: Buffer) => chunks.push(chunk));
        stream.on("end", async () => {
          try {
            await writeFile(
              restoreAbsolute,
              new Uint8Array(Buffer.concat(chunks)),
            );
          } catch (error) {
            reject(error);
            return;
          }
          next();
        });
        stream.on("error", reject);
      } else {
        stream.resume();
        stream.on("end", next);
        stream.on("error", () => next());
      }
    });

    ext.on("finish", resolve);
    ext.on("error", reject);

    ext.end(Buffer.from(decompressed));
  });

  await rm(trashPath, { force: true });

  return restoreAbsolute;
}

/**
 * Clear all trash entries for a workspace.
 *
 * @returns Count of cleared entries and total bytes freed.
 */
export async function clearTrash(
  workspaceRoot: string,
): Promise<{ cleared: number; bytesFreed: number }> {
  const bucket = trashWorkspaceDir(workspaceRoot);
  let count = 0;
  let totalBytes = 0;

  try {
    const entries = await readdir(bucket);
    for (const name of entries) {
      if (!name.endsWith(".tar.gz")) continue;
      try {
        const fileStat = await stat(join(bucket, name));
        totalBytes += fileStat.size;
        count += 1;
      } catch {
        // best-effort
      }
    }
    await rm(bucket, { recursive: true, force: true });
  } catch {
    // bucket doesn't exist or can't be read — already empty
  }

  return { cleared: count, bytesFreed: totalBytes };
}
