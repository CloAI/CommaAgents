import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { existsSync, realpathSync } from "node:fs";
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  clearTrash,
  listTrash,
  moveToTrash,
  readTrashMetadata,
  restoreFromTrash,
  trashWorkspaceDir,
} from "./trash";

let workspaceRoot: string;

beforeEach(async () => {
  workspaceRoot = await mkdtemp(join(realpathSync(tmpdir()), "trash-io-ws-"));
});

afterEach(async () => {
  await rm(workspaceRoot, { recursive: true, force: true });
  await rm(trashWorkspaceDir(workspaceRoot), { recursive: true, force: true });
});

async function seedAndTrash(
  path: string,
  content: string,
  metadata?: { sessionId?: string; runId?: string; agentName?: string },
): Promise<string> {
  const absolutePath = join(workspaceRoot, path);
  await writeFile(absolutePath, content);
  return moveToTrash(workspaceRoot, absolutePath, metadata);
}

describe("trash IO", () => {
  it("moves files to trash with readable metadata", async () => {
    const archive = await seedAndTrash("note.txt", "content", {
      sessionId: "session-1",
      runId: "run-1",
      agentName: "writer",
    });

    const metadata = await readTrashMetadata(archive);

    expect(metadata).toMatchObject({
      originalPath: "note.txt",
      sessionId: "session-1",
      runId: "run-1",
      agentName: "writer",
    });
    expect(metadata?.originalSha256).toHaveLength(64);
    expect(existsSync(join(workspaceRoot, "note.txt"))).toBe(false);
  });

  it("lists valid archives and ignores unrelated or corrupt entries", async () => {
    const archive = await seedAndTrash("valid.txt", "valid");
    const bucket = trashWorkspaceDir(workspaceRoot);
    await writeFile(join(bucket, "ignore.txt"), "ignored");
    await writeFile(join(bucket, "corrupt.tar.gz"), "not an archive");

    const entries = await listTrash(workspaceRoot);

    expect(entries).toHaveLength(1);
    expect(entries[0]?.path).toBe(archive);
    expect(entries[0]?.metadata.originalPath).toBe("valid.txt");
    expect(entries[0]?.sizeBytes).toBeGreaterThan(0);
  });

  it("returns an empty list when the workspace has no trash bucket", async () => {
    expect(await listTrash(workspaceRoot)).toEqual([]);
  });

  it("restores an archive and removes it from trash", async () => {
    const archive = await seedAndTrash("original.txt", "restored");

    const restoredPath = await restoreFromTrash(
      workspaceRoot,
      archive,
      "nested/restored.txt",
    );

    expect(restoredPath).toBe(join(workspaceRoot, "nested/restored.txt"));
    expect(await readFile(restoredPath, "utf8")).toBe("restored");
    expect(existsSync(archive)).toBe(false);
  });

  it("rejects direct restore targets that escape the workspace", async () => {
    const archive = await seedAndTrash("original.txt", "content");

    await expect(
      restoreFromTrash(workspaceRoot, archive, "../outside.txt"),
    ).rejects.toThrow("escapes workspace");
    expect(existsSync(archive)).toBe(true);
  });

  it("rejects archives without readable metadata", async () => {
    const archive = join(workspaceRoot, "corrupt.tar.gz");
    await writeFile(archive, "not an archive");

    await expect(restoreFromTrash(workspaceRoot, archive)).rejects.toThrow(
      "Could not read metadata",
    );
  });

  it("clears only trash archives and reports bytes freed", async () => {
    await seedAndTrash("one.txt", "one");
    await seedAndTrash("two.txt", "two");
    const bucket = trashWorkspaceDir(workspaceRoot);
    await writeFile(join(bucket, "ignore.txt"), "ignored");

    const result = await clearTrash(workspaceRoot);

    expect(result.cleared).toBe(2);
    expect(result.bytesFreed).toBeGreaterThan(0);
    expect(existsSync(bucket)).toBe(false);
    expect(await clearTrash(workspaceRoot)).toEqual({
      cleared: 0,
      bytesFreed: 0,
    });
  });

  it("ignores archive entries that disappear before they can be statted", async () => {
    const bucket = trashWorkspaceDir(workspaceRoot);
    await mkdir(bucket, { recursive: true });
    await symlink(
      join(bucket, "missing-target"),
      join(bucket, "missing.tar.gz"),
    );

    const result = await clearTrash(workspaceRoot);

    expect(result).toEqual({ cleared: 0, bytesFreed: 0 });
  });
});
