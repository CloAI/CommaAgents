import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";
import { pack } from "tar-stream";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { existsSync, realpathSync } from "node:fs";
import {
  chmod,
  stat,
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
  clearDeletedFiles,
  listDeletedFiles,
  deleteFile,
  restoreDeletedFile,
  getDeletedFilesDirectory,
} from "./deletion";

let workspaceRoot: string;

beforeEach(async () => {
  workspaceRoot = await mkdtemp(join(realpathSync(tmpdir()), "trash-io-ws-"));
});

afterEach(async () => {
  await rm(workspaceRoot, { recursive: true, force: true });
  await rm(getDeletedFilesDirectory(workspaceRoot), {
    recursive: true,
    force: true,
  });
});

async function seedAndDelete(
  path: string,
  content: string,
  metadata?: { sessionId?: string; runId?: string; agentName?: string },
): Promise<string> {
  const absolutePath = join(workspaceRoot, path);
  await writeFile(absolutePath, content);
  return (await deleteFile(workspaceRoot, absolutePath, { metadata }))
    .archivePath!;
}

describe("file deletion", () => {
  it("moves files to trash with readable metadata", async () => {
    const archive = await seedAndDelete("note.txt", "content", {
      sessionId: "session-1",
      runId: "run-1",
      agentName: "writer",
    });

    const entries = await listDeletedFiles(workspaceRoot);
    expect(entries[0]?.path).toBe(archive);
    const metadata = entries[0]?.metadata;

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
    const archive = await seedAndDelete("valid.txt", "valid");
    const bucket = getDeletedFilesDirectory(workspaceRoot);
    await writeFile(join(bucket, "ignore.txt"), "ignored");
    await writeFile(join(bucket, "corrupt.tar.gz"), "not an archive");

    const entries = await listDeletedFiles(workspaceRoot);

    expect(entries).toHaveLength(1);
    expect(entries[0]?.path).toBe(archive);
    expect(entries[0]?.metadata.originalPath).toBe("valid.txt");
    expect(entries[0]?.sizeBytes).toBeGreaterThan(0);
  });

  it("returns an empty list when the workspace has no trash bucket", async () => {
    expect(await listDeletedFiles(workspaceRoot)).toEqual([]);
  });

  it("restores an archive and removes it from trash", async () => {
    const archive = await seedAndDelete("original.txt", "restored");

    const restoredPath = await restoreDeletedFile(workspaceRoot, archive, {
      targetPath: "nested/restored.txt",
    });

    expect(restoredPath).toBe(join(workspaceRoot, "nested/restored.txt"));
    expect(await readFile(restoredPath, "utf8")).toBe("restored");
    expect(existsSync(archive)).toBe(false);
  });

  it("rejects direct restore targets that escape the workspace", async () => {
    const archive = await seedAndDelete("original.txt", "content");

    await expect(
      restoreDeletedFile(workspaceRoot, archive, {
        targetPath: "../outside.txt",
      }),
    ).rejects.toThrow("escapes workspace");
    expect(existsSync(archive)).toBe(true);
  });

  it("rejects archives without readable metadata", async () => {
    const bucket = getDeletedFilesDirectory(workspaceRoot);
    await mkdir(bucket, { recursive: true });
    const archive = join(bucket, "corrupt.tar.gz");
    await writeFile(archive, "not an archive");

    await expect(restoreDeletedFile(workspaceRoot, archive)).rejects.toThrow(
      "corrupted",
    );
  });

  it("clears only trash archives and reports bytes freed", async () => {
    await seedAndDelete("one.txt", "one");
    await seedAndDelete("two.txt", "two");
    const bucket = getDeletedFilesDirectory(workspaceRoot);
    await writeFile(join(bucket, "ignore.txt"), "ignored");

    const result = await clearDeletedFiles(workspaceRoot);

    expect(result.cleared).toBe(2);
    expect(result.bytesFreed).toBeGreaterThan(0);
    expect(existsSync(bucket)).toBe(false);
    expect(await clearDeletedFiles(workspaceRoot)).toEqual({
      cleared: 0,
      bytesFreed: 0,
    });
  });

  it("ignores archive entries that disappear before they can be statted", async () => {
    const bucket = getDeletedFilesDirectory(workspaceRoot);
    await mkdir(bucket, { recursive: true });
    await symlink(
      join(bucket, "missing-target"),
      join(bucket, "missing.tar.gz"),
    );

    const result = await clearDeletedFiles(workspaceRoot);

    expect(result).toEqual({ cleared: 0, bytesFreed: 0 });
  });
});

async function recoveryArchive(
  entries: Record<string, string>,
): Promise<string> {
  const bucket = getDeletedFilesDirectory(workspaceRoot);
  await mkdir(bucket, { recursive: true });
  const archive = pack();
  for (const [name, content] of Object.entries(entries)) {
    archive.entry({ name }, content);
  }
  archive.finalize();
  const chunks: Buffer[] = [];
  for await (const chunk of archive) {
    chunks.push(Buffer.from(chunk as Uint8Array));
  }
  const path = join(bucket, "fixture.tar.gz");
  await writeFile(path, gzipSync(Buffer.concat(chunks)));
  return path;
}

describe("safe deletion and recovery", () => {
  it("should keep distinct archives for same-named files deleted in the same millisecond", async () => {
    await mkdir(join(workspaceRoot, "one"));
    await mkdir(join(workspaceRoot, "two"));
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-12T12:00:00Z"));
    try {
      const metadata = { sessionId: "session", runId: "run" };
      const first = await seedAndDelete("one/same.txt", "first", metadata);
      const second = await seedAndDelete("two/same.txt", "second", metadata);
      expect(first).not.toBe(second);
      await restoreDeletedFile(workspaceRoot, first);
      await restoreDeletedFile(workspaceRoot, second);
      expect(await readFile(join(workspaceRoot, "one/same.txt"), "utf8")).toBe(
        "first",
      );
      expect(await readFile(join(workspaceRoot, "two/same.txt"), "utf8")).toBe(
        "second",
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it("should retain an archive with missing file content instead of reporting successful restore", async () => {
    const archive = await recoveryArchive({
      "metadata.json": JSON.stringify({
        trashedAt: new Date().toISOString(),
        originalPath: "lost.txt",
        originalSha256: "0".repeat(64),
      }),
    });
    await expect(restoreDeletedFile(workspaceRoot, archive)).rejects.toThrow(
      "corrupted",
    );
    expect(existsSync(archive)).toBe(true);
    expect(existsSync(join(workspaceRoot, "lost.txt"))).toBe(false);
  });

  it("should validate file content against the recorded hash before restoration", async () => {
    const archive = await recoveryArchive({
      "metadata.json": JSON.stringify({
        trashedAt: new Date().toISOString(),
        originalPath: "changed.txt",
        originalSha256: "0".repeat(64),
      }),
      "changed.txt": "modified",
    });
    await expect(restoreDeletedFile(workspaceRoot, archive)).rejects.toThrow(
      "corrupted",
    );
    expect(existsSync(archive)).toBe(true);
    expect(existsSync(join(workspaceRoot, "changed.txt"))).toBe(false);
  });

  it("should restore archives created in the previous file layout", async () => {
    const content = "legacy file";
    const archive = await recoveryArchive({
      "metadata.json": JSON.stringify({
        trashedAt: new Date().toISOString(),
        originalPath: "legacy.txt",
        originalSha256: createHash("sha256").update(content).digest("hex"),
      }),
      "legacy.txt": content,
    });
    await restoreDeletedFile(workspaceRoot, archive);
    expect(await readFile(join(workspaceRoot, "legacy.txt"), "utf8")).toBe(
      content,
    );
  });

  it("should refuse existing restore targets without replacing newer work", async () => {
    const archive = await seedAndDelete("existing.txt", "old");
    await writeFile(join(workspaceRoot, "existing.txt"), "newer work");
    await expect(
      restoreDeletedFile(workspaceRoot, archive),
    ).rejects.toMatchObject({ code: "EEXIST" });
    expect(await readFile(join(workspaceRoot, "existing.txt"), "utf8")).toBe(
      "newer work",
    );
    expect(existsSync(archive)).toBe(true);
  });

  it("should reject archives from another workspace", async () => {
    const otherWorkspace = join(workspaceRoot, "other-workspace");
    await mkdir(otherWorkspace);
    await writeFile(join(otherWorkspace, "private.txt"), "private");
    const { archivePath } = await deleteFile(otherWorkspace, "private.txt");
    try {
      await expect(
        restoreDeletedFile(workspaceRoot, archivePath!),
      ).rejects.toMatchObject({ code: "OUTSIDE_WORKSPACE" });
      expect(existsSync(archivePath!)).toBe(true);
      expect(existsSync(join(workspaceRoot, "private.txt"))).toBe(false);
    } finally {
      await rm(getDeletedFilesDirectory(otherWorkspace), {
        recursive: true,
        force: true,
      });
    }
  });

  it("should reject a restore through a directory symlink outside the workspace", async () => {
    const outside = await mkdtemp(
      join(realpathSync(tmpdir()), "delete-outside-"),
    );
    const archive = await seedAndDelete("safe.txt", "safe");
    try {
      await symlink(outside, join(workspaceRoot, "linked"));
      await expect(
        restoreDeletedFile(workspaceRoot, archive, {
          targetPath: "linked/escape.txt",
        }),
      ).rejects.toMatchObject({ code: "OUTSIDE_WORKSPACE" });
      expect(existsSync(join(outside, "escape.txt"))).toBe(false);
      expect(existsSync(archive)).toBe(true);
    } finally {
      await rm(outside, { recursive: true, force: true });
    }
  });

  it("should preserve file permissions and protect recovery archives", async () => {
    const path = join(workspaceRoot, "executable.sh");
    await writeFile(path, "#!/bin/sh\nexit 0\n");
    await chmod(path, 0o755);
    const { archivePath } = await deleteFile(workspaceRoot, path);
    expect((await stat(archivePath!)).mode & 0o777).toBe(0o600);
    await restoreDeletedFile(workspaceRoot, archivePath!);
    expect((await stat(path)).mode & 0o777).toBe(0o755);
  });

  it("should restore an empty file and a file named metadata.json", async () => {
    for (const [path, content] of [
      ["empty.txt", ""],
      ["metadata.json", '{"user":true}'],
    ]) {
      const archive = await seedAndDelete(path!, content!);
      await restoreDeletedFile(workspaceRoot, archive);
      expect(await readFile(join(workspaceRoot, path!), "utf8")).toBe(content);
    }
  });

  it("should allow permanent deletion without creating an archive", async () => {
    await writeFile(join(workspaceRoot, "temporary.txt"), "temporary");
    expect(
      await deleteFile(workspaceRoot, "temporary.txt", { permanent: true }),
    ).toEqual({});
    expect(existsSync(join(workspaceRoot, "temporary.txt"))).toBe(false);
    expect(await listDeletedFiles(workspaceRoot)).toEqual([]);
  });

  it("should authorize restoration before creating target directories", async () => {
    const archive = await seedAndDelete("original.txt", "original");
    await expect(
      restoreDeletedFile(workspaceRoot, archive, {
        targetPath: "blocked/target.txt",
        authorize: async () => {
          throw new Error("Denied");
        },
      }),
    ).rejects.toThrow("Denied");
    expect(existsSync(join(workspaceRoot, "blocked"))).toBe(false);
    expect(existsSync(archive)).toBe(true);
  });
});
