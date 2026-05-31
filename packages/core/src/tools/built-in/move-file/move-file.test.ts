import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test";
import { existsSync, realpathSync } from "node:fs";
import * as fsp from "node:fs/promises";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createSandbox } from "../../../sandbox/sandbox";
import type { AuditSink } from "../../io/audit.types";
import { createMemoryAuditSink } from "../../io/audit-sink";
import { sha256OfBuffer } from "../../io/hash";
import { trashWorkspaceDir } from "../../io/trash";
import { makeToolContext } from "../../test.utils";
import type { ToolContext } from "../../tool.types";
import { createMoveFileTool, type MoveFileData } from "./index";

let workspaceRoot: string;

beforeEach(async () => {
  const base = realpathSync(tmpdir());
  workspaceRoot = await mkdtemp(join(base, "move-file-ws-"));
});

afterEach(async () => {
  await rm(workspaceRoot, { recursive: true, force: true });
  await rm(trashWorkspaceDir(workspaceRoot), { recursive: true, force: true });
});

function makeCtx(overrides?: {
  jail?: boolean;
  allowAbsolutePaths?: boolean;
  forbiddenGlobs?: readonly string[];
  auditSink?: AuditSink;
  sessionId?: string;
  agentName?: string;
}): ToolContext {
  return makeToolContext({
    agentName: overrides?.agentName ?? "test-agent",
    sandbox: createSandbox({
      cwd: workspaceRoot,
      jail: overrides?.jail ?? true,
      allowAbsolutePaths: overrides?.allowAbsolutePaths ?? false,
      forbiddenGlobs: overrides?.forbiddenGlobs ?? [],
    }),
    ...(overrides?.auditSink !== undefined
      ? { auditSink: overrides.auditSink }
      : {}),
    ...(overrides?.sessionId !== undefined
      ? { sessionId: overrides.sessionId }
      : {}),
  });
}

async function seedFile(
  relPath: string,
  content: string | Uint8Array,
): Promise<string> {
  const abs = join(workspaceRoot, relPath);
  await mkdir(join(workspaceRoot, "_").replace(/\/_$/, ""), {
    recursive: true,
  });
  await writeFile(abs, content);
  const buf =
    typeof content === "string" ? new TextEncoder().encode(content) : content;
  return sha256OfBuffer(buf);
}

async function getOk(
  result: Awaited<ReturnType<ReturnType<typeof createMoveFileTool>["execute"]>>,
): Promise<MoveFileData> {
  if (!result.ok) {
    throw new Error(
      `expected ok, got error: ${result.error?.kind} ${result.error?.message}`,
    );
  }
  if (!result.data) throw new Error("expected data");
  return result.data;
}

describe("createMoveFileTool", () => {
  it("returns a tool definition", () => {
    const tool = createMoveFileTool();
    expect(tool.description.length).toBeGreaterThan(0);
    expect(typeof tool.execute).toBe("function");
  });

  it("moves a file to a new path", async () => {
    const sha = await seedFile("src.txt", "payload\n");
    const tool = createMoveFileTool();
    const data = await getOk(
      await tool.execute(
        { fromPath: "src.txt", toPath: "dst.txt", expectedSha256: sha },
        makeCtx(),
      ),
    );
    expect(data.moved).toBe(true);
    expect(data.sha256).toBe(sha);
    expect(data.sizeBytes).toBe(8);
    expect(data.overwroteTrashedTo).toBeUndefined();
    expect(existsSync(join(workspaceRoot, "src.txt"))).toBe(false);
    expect(await readFile(join(workspaceRoot, "dst.txt"), "utf8")).toBe(
      "payload\n",
    );
  });

  it("moves into a subdirectory whose parent exists", async () => {
    await mkdir(join(workspaceRoot, "sub"));
    const sha = await seedFile("a.txt", "x");
    const tool = createMoveFileTool();
    await getOk(
      await tool.execute(
        { fromPath: "a.txt", toPath: "sub/b.txt", expectedSha256: sha },
        makeCtx(),
      ),
    );
    expect(existsSync(join(workspaceRoot, "sub/b.txt"))).toBe(true);
  });

  it("fails with already_exists when destination exists and overwrite is false", async () => {
    const sha = await seedFile("a.txt", "from\n");
    await seedFile("b.txt", "to\n");
    const tool = createMoveFileTool();
    const result = await tool.execute(
      { fromPath: "a.txt", toPath: "b.txt", expectedSha256: sha },
      makeCtx(),
    );
    expect(result.ok).toBe(false);
    expect(result.error?.kind).toBe("already_exists");
    expect(result.error?.suggestedNextAction).toContain("overwrite");
    expect(await readFile(join(workspaceRoot, "a.txt"), "utf8")).toBe("from\n");
    expect(await readFile(join(workspaceRoot, "b.txt"), "utf8")).toBe("to\n");
  });

  it("overwrites and trashes the displaced file when overwrite is true", async () => {
    const sha = await seedFile("a.txt", "new\n");
    await seedFile("b.txt", "victim\n");
    const tool = createMoveFileTool();
    const data = await getOk(
      await tool.execute(
        {
          fromPath: "a.txt",
          toPath: "b.txt",
          expectedSha256: sha,
          overwrite: true,
        },
        makeCtx(),
      ),
    );
    expect(typeof data.overwroteTrashedTo).toBe("string");
    expect(data.overwroteTrashedTo).toEndWith(".tar.gz");
    expect(await readFile(join(workspaceRoot, "b.txt"), "utf8")).toBe("new\n");
    expect(existsSync(data.overwroteTrashedTo!)).toBe(true);
  });

  it("fails with already_exists when destination is a directory (even with overwrite)", async () => {
    const sha = await seedFile("a.txt", "x");
    await mkdir(join(workspaceRoot, "dir"));
    const tool = createMoveFileTool();
    const result = await tool.execute(
      {
        fromPath: "a.txt",
        toPath: "dir",
        expectedSha256: sha,
        overwrite: true,
      },
      makeCtx(),
    );
    expect(result.ok).toBe(false);
    expect(result.error?.kind).toBe("already_exists");
  });

  it("fails with not_found when the destination's parent directory does not exist", async () => {
    const sha = await seedFile("a.txt", "x");
    const tool = createMoveFileTool();
    const result = await tool.execute(
      {
        fromPath: "a.txt",
        toPath: "missing/dir/b.txt",
        expectedSha256: sha,
      },
      makeCtx(),
    );
    expect(result.ok).toBe(false);
    expect(result.error?.kind).toBe("not_found");
    expect(result.error?.suggestedNextAction).toContain("create_file");
    expect(existsSync(join(workspaceRoot, "a.txt"))).toBe(true);
  });

  it("fails with stale_file on hash mismatch and leaves the source intact", async () => {
    const realSha = await seedFile("a.txt", "real\n");
    const wrong = "0".repeat(64);
    const tool = createMoveFileTool();
    const result = await tool.execute(
      { fromPath: "a.txt", toPath: "b.txt", expectedSha256: wrong },
      makeCtx(),
    );
    expect(result.ok).toBe(false);
    expect(result.error?.kind).toBe("stale_file");
    expect(result.error?.details?.actualSha256).toBe(realSha);
    expect(await readFile(join(workspaceRoot, "a.txt"), "utf8")).toBe("real\n");
    expect(existsSync(join(workspaceRoot, "b.txt"))).toBe(false);
  });

  it("fails with not_found when source is missing", async () => {
    const tool = createMoveFileTool();
    const result = await tool.execute(
      {
        fromPath: "nope.txt",
        toPath: "x.txt",
        expectedSha256: sha256OfBuffer(""),
      },
      makeCtx(),
    );
    expect(result.ok).toBe(false);
    expect(result.error?.kind).toBe("not_found");
  });

  it("fails with not_found when source is a directory", async () => {
    await mkdir(join(workspaceRoot, "dir"));
    const tool = createMoveFileTool();
    const result = await tool.execute(
      {
        fromPath: "dir",
        toPath: "x.txt",
        expectedSha256: sha256OfBuffer(""),
      },
      makeCtx(),
    );
    expect(result.ok).toBe(false);
    expect(result.error?.kind).toBe("not_found");
  });

  it("rejects when fromPath and toPath are identical", async () => {
    const sha = await seedFile("a.txt", "x");
    const tool = createMoveFileTool();
    const result = await tool.execute(
      { fromPath: "a.txt", toPath: "a.txt", expectedSha256: sha },
      makeCtx(),
    );
    expect(result.ok).toBe(false);
    expect(result.error?.kind).toBe("command_failed");
  });

  it("rejects path traversal in either path with outside_workspace", async () => {
    const tool = createMoveFileTool();
    const r1 = await tool.execute(
      {
        fromPath: "../from.txt",
        toPath: "x.txt",
        expectedSha256: sha256OfBuffer(""),
      },
      makeCtx({ jail: true }),
    );
    expect(r1.error?.kind).toBe("outside_workspace");

    await seedFile("inside.txt", "x");
    const sha = sha256OfBuffer("x");
    const r2 = await tool.execute(
      {
        fromPath: "inside.txt",
        toPath: "../escape.txt",
        expectedSha256: sha,
      },
      makeCtx({ jail: true }),
    );
    expect(r2.error?.kind).toBe("outside_workspace");
  });

  it("rejects forbidden globs with permission_denied", async () => {
    const sha = await seedFile("secret.env", "TOKEN=1");
    const tool = createMoveFileTool();
    const result = await tool.execute(
      {
        fromPath: "secret.env",
        toPath: "exposed.txt",
        expectedSha256: sha,
      },
      makeCtx({ forbiddenGlobs: ["**/*.env"] }),
    );
    expect(result.ok).toBe(false);
    expect(result.error?.kind).toBe("permission_denied");
  });

  it("rejects invalid expectedSha256 format at the schema layer", () => {
    const tool = createMoveFileTool();
    expect(() =>
      tool.parameters.parse({
        fromPath: "a.txt",
        toPath: "b.txt",
        expectedSha256: "not-a-hash",
      }),
    ).toThrow();
  });

  it("appends a successful move audit entry", async () => {
    const sha = await seedFile("audited.txt", "v\n");
    const sink = createMemoryAuditSink();
    const tool = createMoveFileTool();
    await getOk(
      await tool.execute(
        {
          fromPath: "audited.txt",
          toPath: "moved.txt",
          expectedSha256: sha,
        },
        makeCtx({ auditSink: sink, sessionId: "s1", agentName: "mover" }),
      ),
    );

    const entries = await sink.list();
    expect(entries.length).toBe(1);
    const entry = entries[0]!;
    expect(entry.success).toBe(true);
    expect(entry.operation).toBe("move");
    expect(entry.toolName).toBe("move_file");
    expect(entry.path).toBe("audited.txt");
    expect(entry.toPath).toBe("moved.txt");
    expect(entry.beforeSha256).toBe(sha);
    expect(entry.afterSha256).toBe(sha);
    expect(entry.sessionId).toBe("s1");
  });

  it("audit records overwroteTrashedTo when overwrite displaces an existing file", async () => {
    const sha = await seedFile("a.txt", "new");
    await seedFile("b.txt", "old");
    const sink = createMemoryAuditSink();
    const tool = createMoveFileTool();
    const data = await getOk(
      await tool.execute(
        {
          fromPath: "a.txt",
          toPath: "b.txt",
          expectedSha256: sha,
          overwrite: true,
        },
        makeCtx({ auditSink: sink }),
      ),
    );
    const entries = await sink.list();
    expect(entries[0]?.details?.overwroteTrashedTo).toBe(
      data.overwroteTrashedTo!,
    );
  });

  it("falls back to factory defaultAuditSink when ctx has none", async () => {
    const sha = await seedFile("fb.txt", "a");
    const sink = createMemoryAuditSink();
    const tool = createMoveFileTool({ defaultAuditSink: sink });
    await getOk(
      await tool.execute(
        { fromPath: "fb.txt", toPath: "fb2.txt", expectedSha256: sha },
        makeCtx(),
      ),
    );
    const entries = await sink.list();
    expect(entries.length).toBe(1);
    expect(entries[0]?.toPath).toBe("fb2.txt");
  });

  it("returns command_failed when aborted before start", async () => {
    const sha = await seedFile("a.txt", "x");
    const controller = new AbortController();
    controller.abort();
    const primaryContext = makeToolContext({
      sandbox: createSandbox({ cwd: workspaceRoot, jail: true }),
      abort: controller.signal,
    });
    const tool = createMoveFileTool();
    const result = await tool.execute(
      { fromPath: "a.txt", toPath: "b.txt", expectedSha256: sha },
      primaryContext,
    );
    expect(result.ok).toBe(false);
    expect(result.error?.kind).toBe("command_failed");
    expect(existsSync(join(workspaceRoot, "a.txt"))).toBe(true);
    expect(existsSync(join(workspaceRoot, "b.txt"))).toBe(false);
  });

  it("falls back to copy+unlink when rename throws EXDEV (cross-device)", async () => {
    const content = "cross-device payload";
    const sha = await seedFile("src.txt", content);

    const exdev = Object.assign(new Error("EXDEV: cross-device link"), {
      code: "EXDEV",
    });
    const renameSpy = spyOn(fsp, "rename").mockRejectedValueOnce(exdev);

    try {
      const tool = createMoveFileTool();
      const result = await tool.execute(
        { fromPath: "src.txt", toPath: "dst.txt", expectedSha256: sha },
        makeCtx(),
      );

      expect(result.ok).toBe(true);
      expect(renameSpy).toHaveBeenCalledTimes(1);
      expect(existsSync(join(workspaceRoot, "src.txt"))).toBe(false);
      expect(existsSync(join(workspaceRoot, "dst.txt"))).toBe(true);
      const dst = await readFile(join(workspaceRoot, "dst.txt"), "utf8");
      expect(dst).toBe(content);
    } finally {
      renameSpy.mockRestore();
    }
  });
});
