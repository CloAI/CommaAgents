import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { existsSync, realpathSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createSandbox } from "../../../sandbox/sandbox";
import { moveToTrash, trashWorkspaceDir } from "../../io";
import { makeToolContext } from "../../test.utils";
import type { ToolContext } from "../../tool.types";
import { createRestoreFileTool } from "./restore-file";

let workspaceRoot: string;

beforeEach(async () => {
  workspaceRoot = await mkdtemp(
    join(realpathSync(tmpdir()), "restore-file-ws-"),
  );
});

afterEach(async () => {
  await rm(workspaceRoot, { recursive: true, force: true });
  await rm(trashWorkspaceDir(workspaceRoot), { recursive: true, force: true });
});

function makeCtx(options?: {
  abort?: AbortSignal;
  forbiddenGlobs?: readonly string[];
}): ToolContext {
  return makeToolContext({
    sandbox: createSandbox({
      cwd: workspaceRoot,
      jail: true,
      allowAbsolutePaths: false,
      forbiddenGlobs: options?.forbiddenGlobs ?? [],
    }),
    ...(options?.abort ? { abort: options.abort } : {}),
  });
}

async function trashFile(path: string, content: string): Promise<string> {
  const absolutePath = join(workspaceRoot, path);
  await writeFile(absolutePath, content);
  return moveToTrash(workspaceRoot, absolutePath);
}

describe("createRestoreFileTool", () => {
  it("returns a tool definition", () => {
    const tool = createRestoreFileTool();

    expect(tool.description.length).toBeGreaterThan(0);
    expect(typeof tool.execute).toBe("function");
  });

  it("restores a trashed file to its original path", async () => {
    const archive = await trashFile("original.txt", "restored\n");

    const result = await createRestoreFileTool().execute(
      { trashedPath: archive },
      makeCtx(),
    );

    expect(result.ok).toBe(true);
    expect(result.data).toEqual({
      restored: true,
      path: "original.txt",
      from: archive,
      sizeBytes: 9,
    });
    expect(await readFile(join(workspaceRoot, "original.txt"), "utf8")).toBe(
      "restored\n",
    );
    expect(existsSync(archive)).toBe(false);
  });

  it("restores to an authorized override path", async () => {
    const archive = await trashFile("original.txt", "content");

    const result = await createRestoreFileTool().execute(
      { trashedPath: archive, targetPath: "nested/restored.txt" },
      makeCtx(),
    );

    expect(result.ok).toBe(true);
    expect(result.data?.path).toBe("nested/restored.txt");
    expect(
      await readFile(join(workspaceRoot, "nested/restored.txt"), "utf8"),
    ).toBe("content");
  });

  it("returns not_found when the archive does not exist", async () => {
    const missing = join(workspaceRoot, "missing.tar.gz");

    const result = await createRestoreFileTool().execute(
      { trashedPath: missing },
      makeCtx(),
    );

    expect(result.ok).toBe(false);
    expect(result.error?.kind).toBe("not_found");
  });

  it("returns not_found when archive metadata is corrupted", async () => {
    const archive = join(workspaceRoot, "corrupt.tar.gz");
    await writeFile(archive, "not an archive");

    const result = await createRestoreFileTool().execute(
      { trashedPath: archive },
      makeCtx(),
    );

    expect(result.ok).toBe(false);
    expect(result.error?.kind).toBe("not_found");
    expect(result.error?.message).toContain("metadata");
  });

  it("returns command_failed when aborted before start", async () => {
    const archive = await trashFile("original.txt", "content");
    const controller = new AbortController();
    controller.abort();

    const result = await createRestoreFileTool().execute(
      { trashedPath: archive },
      makeCtx({ abort: controller.signal }),
    );

    expect(result.ok).toBe(false);
    expect(result.error?.kind).toBe("command_failed");
    expect(existsSync(archive)).toBe(true);
  });

  it("refuses to overwrite an existing restore target", async () => {
    const archive = await trashFile("original.txt", "archived");
    await writeFile(join(workspaceRoot, "original.txt"), "current");

    const result = await createRestoreFileTool().execute(
      { trashedPath: archive },
      makeCtx(),
    );

    expect(result.ok).toBe(false);
    expect(result.error?.kind).toBe("already_exists");
    expect(await readFile(join(workspaceRoot, "original.txt"), "utf8")).toBe(
      "current",
    );
    expect(existsSync(archive)).toBe(true);
  });

  it("rejects a restore target outside the workspace", async () => {
    const archive = await trashFile("original.txt", "content");

    const result = await createRestoreFileTool().execute(
      { trashedPath: archive, targetPath: "../outside.txt" },
      makeCtx(),
    );

    expect(result.ok).toBe(false);
    expect(result.error?.kind).toBe("outside_workspace");
    expect(existsSync(archive)).toBe(true);
  });

  it("rejects restore targets blocked by forbidden globs", async () => {
    const archive = await trashFile("original.txt", "content");

    const result = await createRestoreFileTool().execute(
      { trashedPath: archive, targetPath: "secret.env" },
      makeCtx({ forbiddenGlobs: ["**/*.env"] }),
    );

    expect(result.ok).toBe(false);
    expect(result.error?.kind).toBe("permission_denied");
    expect(existsSync(archive)).toBe(true);
  });

  it("returns command_failed when the restore parent is not a directory", async () => {
    const archive = await trashFile("original.txt", "content");
    await writeFile(join(workspaceRoot, "parent"), "not a directory");

    const result = await createRestoreFileTool().execute(
      { trashedPath: archive, targetPath: "parent/restored.txt" },
      makeCtx(),
    );

    expect(result.ok).toBe(false);
    expect(result.error?.kind).toBe("command_failed");
    expect(existsSync(archive)).toBe(true);
  });
});
