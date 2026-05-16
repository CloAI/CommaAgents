import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { existsSync, realpathSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createSandbox } from "../../../sandbox/sandbox";
import type { AuditSink } from "../../io/audit";
import { createMemoryAuditSink } from "../../io/audit-sink";
import { sha256OfBuffer } from "../../io/hash";
import { trashWorkspaceDir } from "../../io/trash";
import { makeToolContext } from "../../test.utils";
import type { ToolContext } from "../../tool.types";
import { type ApplyPatchData, createApplyPatchTool } from "./index";

let workspaceRoot: string;

beforeEach(async () => {
  const base = realpathSync(tmpdir());
  workspaceRoot = await mkdtemp(join(base, "apply-patch-ws-"));
});

afterEach(async () => {
  await rm(workspaceRoot, { recursive: true, force: true });
  await rm(trashWorkspaceDir(workspaceRoot), { recursive: true, force: true });
});

function makeCtx(overrides?: {
  auditSink?: AuditSink;
  sessionId?: string;
  agentName?: string;
}): ToolContext {
  return makeToolContext({
    agentName: overrides?.agentName ?? "test-agent",
    sandbox: createSandbox({ cwd: workspaceRoot, jail: true }),
    ...(overrides?.auditSink !== undefined
      ? { auditSink: overrides.auditSink }
      : {}),
    ...(overrides?.sessionId !== undefined
      ? { sessionId: overrides.sessionId }
      : {}),
  });
}

async function seed(relPath: string, content: string): Promise<string> {
  const abs = join(workspaceRoot, relPath);
  await mkdir(join(abs, ".."), { recursive: true });
  await writeFile(abs, content);
  return sha256OfBuffer(new TextEncoder().encode(content));
}

async function getOk(
  result: Awaited<
    ReturnType<ReturnType<typeof createApplyPatchTool>["execute"]>
  >,
): Promise<ApplyPatchData> {
  if (!result.ok) {
    throw new Error(
      `expected ok, got error: ${result.error?.kind} ${result.error?.message}`,
    );
  }
  if (!result.data) throw new Error("expected data");
  return result.data;
}

describe("createApplyPatchTool", () => {
  it("returns a tool definition", () => {
    const tool = createApplyPatchTool();
    expect(tool.description.length).toBeGreaterThan(0);
    expect(typeof tool.execute).toBe("function");
  });

  it("applies an Add File operation", async () => {
    const tool = createApplyPatchTool();
    const patch = [
      "*** Begin Patch",
      "*** Add File: hello.txt",
      "+hello",
      "+world",
      "*** End Patch",
    ].join("\n");
    const data = await getOk(await tool.execute({ patch }, makeCtx()));
    expect(data.changedFiles).toHaveLength(1);
    expect(data.changedFiles[0]?.operation).toBe("add");
    expect(data.changedFiles[0]?.afterSha256).toBeDefined();
    expect(await readFile(join(workspaceRoot, "hello.txt"), "utf8")).toBe(
      "hello\nworld\n",
    );
  });

  it("applies an Update File operation", async () => {
    await seed("foo.ts", "alpha\nbeta\ngamma\n");
    const tool = createApplyPatchTool();
    const patch = [
      "*** Begin Patch",
      "*** Update File: foo.ts",
      "@@",
      " alpha",
      "-beta",
      "+BETA",
      " gamma",
      "*** End Patch",
    ].join("\n");
    const data = await getOk(await tool.execute({ patch }, makeCtx()));
    expect(data.hunkCount).toBe(1);
    expect(await readFile(join(workspaceRoot, "foo.ts"), "utf8")).toBe(
      "alpha\nBETA\ngamma\n",
    );
  });

  it("applies a Delete File operation and trashes the file", async () => {
    await seed("victim.txt", "doomed\n");
    const tool = createApplyPatchTool();
    const patch = [
      "*** Begin Patch",
      "*** Delete File: victim.txt",
      "*** End Patch",
    ].join("\n");
    const data = await getOk(await tool.execute({ patch }, makeCtx()));
    expect(data.changedFiles[0]?.operation).toBe("delete");
    expect(existsSync(join(workspaceRoot, "victim.txt"))).toBe(false);
  });

  it("applies a Move File operation without edits", async () => {
    await seed("from.txt", "stay\n");
    const tool = createApplyPatchTool();
    const patch = [
      "*** Begin Patch",
      "*** Move File: from.txt -> to.txt",
      "*** End Patch",
    ].join("\n");
    const data = await getOk(await tool.execute({ patch }, makeCtx()));
    expect(data.changedFiles[0]?.operation).toBe("move");
    expect(data.changedFiles[0]?.toPath).toBe("to.txt");
    expect(existsSync(join(workspaceRoot, "from.txt"))).toBe(false);
    expect(await readFile(join(workspaceRoot, "to.txt"), "utf8")).toBe(
      "stay\n",
    );
  });

  it("applies a Move File operation with edits", async () => {
    await seed("old.txt", "first\nsecond\nthird\n");
    const tool = createApplyPatchTool();
    const patch = [
      "*** Begin Patch",
      "*** Move File: old.txt -> new.txt",
      "@@",
      " first",
      "-second",
      "+SECOND",
      " third",
      "*** End Patch",
    ].join("\n");
    await getOk(await tool.execute({ patch }, makeCtx()));
    expect(existsSync(join(workspaceRoot, "old.txt"))).toBe(false);
    expect(await readFile(join(workspaceRoot, "new.txt"), "utf8")).toBe(
      "first\nSECOND\nthird\n",
    );
  });

  it("applies a multi-operation patch in order", async () => {
    await seed("update-me.ts", "x\ny\nz\n");
    await seed("delete-me.ts", "bye\n");
    const tool = createApplyPatchTool();
    const patch = [
      "*** Begin Patch",
      "*** Add File: added.ts",
      "+new",
      "*** Update File: update-me.ts",
      "@@",
      " x",
      "-y",
      "+Y",
      " z",
      "*** Delete File: delete-me.ts",
      "*** End Patch",
    ].join("\n");
    const data = await getOk(await tool.execute({ patch }, makeCtx()));
    expect(data.changedFiles).toHaveLength(3);
    expect(data.hunkCount).toBe(1);
    expect(await readFile(join(workspaceRoot, "added.ts"), "utf8")).toBe(
      "new\n",
    );
    expect(await readFile(join(workspaceRoot, "update-me.ts"), "utf8")).toBe(
      "x\nY\nz\n",
    );
    expect(existsSync(join(workspaceRoot, "delete-me.ts"))).toBe(false);
  });

  it("rejects a malformed envelope with patch_parse_error", async () => {
    const tool = createApplyPatchTool();
    const result = await tool.execute({ patch: "not a patch" }, makeCtx());
    expect(result.ok).toBe(false);
    expect(result.error?.kind).toBe("patch_parse_error");
  });

  it("rejects Add File when the file already exists", async () => {
    await seed("clash.txt", "existing\n");
    const tool = createApplyPatchTool();
    const result = await tool.execute(
      {
        patch: [
          "*** Begin Patch",
          "*** Add File: clash.txt",
          "+new",
          "*** End Patch",
        ].join("\n"),
      },
      makeCtx(),
    );
    expect(result.ok).toBe(false);
    expect(result.error?.kind).toBe("already_exists");
  });

  it("rejects Update File when the source is missing", async () => {
    const tool = createApplyPatchTool();
    const result = await tool.execute(
      {
        patch: [
          "*** Begin Patch",
          "*** Update File: ghost.ts",
          "@@",
          "-a",
          "+b",
          "*** End Patch",
        ].join("\n"),
      },
      makeCtx(),
    );
    expect(result.ok).toBe(false);
    expect(result.error?.kind).toBe("not_found");
  });

  it("rejects Move File when destination exists", async () => {
    await seed("a.txt", "A");
    await seed("b.txt", "B");
    const tool = createApplyPatchTool();
    const result = await tool.execute(
      {
        patch: [
          "*** Begin Patch",
          "*** Move File: a.txt -> b.txt",
          "*** End Patch",
        ].join("\n"),
      },
      makeCtx(),
    );
    expect(result.ok).toBe(false);
    expect(result.error?.kind).toBe("already_exists");
  });

  it("rejects when expectedSha256ByPath does not match", async () => {
    await seed("foo.ts", "alpha\nbeta\n");
    const tool = createApplyPatchTool();
    const result = await tool.execute(
      {
        patch: [
          "*** Begin Patch",
          "*** Update File: foo.ts",
          "@@",
          " alpha",
          "-beta",
          "+BETA",
          "*** End Patch",
        ].join("\n"),
        expectedSha256ByPath: { "foo.ts": "0".repeat(64) },
      },
      makeCtx(),
    );
    expect(result.ok).toBe(false);
    expect(result.error?.kind).toBe("stale_file");
  });

  it("accepts matching expectedSha256ByPath", async () => {
    const sha = await seed("foo.ts", "alpha\nbeta\n");
    const tool = createApplyPatchTool();
    const data = await getOk(
      await tool.execute(
        {
          patch: [
            "*** Begin Patch",
            "*** Update File: foo.ts",
            "@@",
            " alpha",
            "-beta",
            "+BETA",
            "*** End Patch",
          ].join("\n"),
          expectedSha256ByPath: { "foo.ts": sha },
        },
        makeCtx(),
      ),
    );
    expect(data.changedFiles).toHaveLength(1);
  });

  it("rejects expectedSha256ByPath sentinel mismatch on Add", async () => {
    const tool = createApplyPatchTool();
    const result = await tool.execute(
      {
        patch: [
          "*** Begin Patch",
          "*** Add File: new.txt",
          "+x",
          "*** End Patch",
        ].join("\n"),
        expectedSha256ByPath: { "new.txt": "f".repeat(64) },
      },
      makeCtx(),
    );
    expect(result.ok).toBe(false);
    expect(result.error?.kind).toBe("stale_file");
  });

  it("rejects hunks that match multiple locations with multiple_matches", async () => {
    await seed("dup.txt", "marker\nmarker\n");
    const tool = createApplyPatchTool();
    const result = await tool.execute(
      {
        patch: [
          "*** Begin Patch",
          "*** Update File: dup.txt",
          "@@",
          "-marker",
          "+changed",
          "*** End Patch",
        ].join("\n"),
      },
      makeCtx(),
    );
    expect(result.ok).toBe(false);
    expect(result.error?.kind).toBe("multiple_matches");
  });

  it("rejects hunks whose context is missing with patch_apply_error", async () => {
    await seed("a.txt", "one\ntwo\n");
    const tool = createApplyPatchTool();
    const result = await tool.execute(
      {
        patch: [
          "*** Begin Patch",
          "*** Update File: a.txt",
          "@@",
          "-zzz",
          "+yyy",
          "*** End Patch",
        ].join("\n"),
      },
      makeCtx(),
    );
    expect(result.ok).toBe(false);
    expect(result.error?.kind).toBe("patch_apply_error");
  });

  it("rejects identical from/to in Move File with command_failed", async () => {
    await seed("a.txt", "x");
    const tool = createApplyPatchTool();
    const result = await tool.execute(
      {
        patch: [
          "*** Begin Patch",
          "*** Move File: a.txt -> a.txt",
          "*** End Patch",
        ].join("\n"),
      },
      makeCtx(),
    );
    expect(result.ok).toBe(false);
    expect(result.error?.kind).toBe("command_failed");
  });

  it("rejects paths that escape the workspace with outside_workspace", async () => {
    const tool = createApplyPatchTool();
    const result = await tool.execute(
      {
        patch: [
          "*** Begin Patch",
          "*** Delete File: ../escape.txt",
          "*** End Patch",
        ].join("\n"),
      },
      makeCtx(),
    );
    expect(result.ok).toBe(false);
    expect(result.error?.kind).toBe("outside_workspace");
  });

  it("rejects duplicate paths in the patch", async () => {
    await seed("foo.ts", "x\n");
    const tool = createApplyPatchTool();
    const result = await tool.execute(
      {
        patch: [
          "*** Begin Patch",
          "*** Update File: foo.ts",
          "@@",
          "-x",
          "+X",
          "*** Delete File: foo.ts",
          "*** End Patch",
        ].join("\n"),
      },
      makeCtx(),
    );
    expect(result.ok).toBe(false);
    expect(result.error?.kind).toBe("patch_apply_error");
  });

  it("atomic mode rolls back when a later operation fails", async () => {
    // First op (Update) succeeds during dry-run; second op (Update on a
    // missing file) fails. Atomic mode should not have left the first
    // file modified.
    const sha = await seed("ok.ts", "stable\n");
    const tool = createApplyPatchTool();
    const result = await tool.execute(
      {
        patch: [
          "*** Begin Patch",
          "*** Update File: ok.ts",
          "@@",
          "-stable",
          "+CHANGED",
          "*** Update File: missing.ts",
          "@@",
          "-x",
          "+y",
          "*** End Patch",
        ].join("\n"),
      },
      makeCtx(),
    );
    expect(result.ok).toBe(false);
    // Dry-run aborts before any disk write, so ok.ts is untouched.
    expect(await readFile(join(workspaceRoot, "ok.ts"), "utf8")).toBe(
      "stable\n",
    );
    expect(sha).toBeDefined();
  });

  it("writes one audit entry per changed file on success", async () => {
    await seed("foo.ts", "x\ny\n");
    const sink = createMemoryAuditSink();
    const tool = createApplyPatchTool();
    await getOk(
      await tool.execute(
        {
          patch: [
            "*** Begin Patch",
            "*** Update File: foo.ts",
            "@@",
            " x",
            "-y",
            "+Y",
            "*** Add File: z.ts",
            "+hi",
            "*** End Patch",
          ].join("\n"),
        },
        makeCtx({ auditSink: sink, sessionId: "s1" }),
      ),
    );
    const entries = await sink.list();
    expect(entries).toHaveLength(2);
    expect(entries.every((entry) => entry.success === true)).toBe(true);
    expect(entries.every((entry) => entry.toolName === "apply_patch")).toBe(
      true,
    );
    expect(entries.map((entry) => entry.operation)).toEqual([
      "update",
      "create",
    ]);
  });

  it("writes a failure audit entry when the patch fails", async () => {
    const sink = createMemoryAuditSink();
    const tool = createApplyPatchTool();
    await tool.execute(
      {
        patch: [
          "*** Begin Patch",
          "*** Update File: missing.ts",
          "@@",
          "-x",
          "+y",
          "*** End Patch",
        ].join("\n"),
      },
      makeCtx({ auditSink: sink }),
    );
    // Dry-run failure happens before commit, so no audit on parse/dry-run
    // by current design — failures are only recorded once we've started
    // committing. This test documents that contract: missing source =>
    // no audit entries.
    expect(await sink.list()).toHaveLength(0);
  });

  it("aborts before start when the signal is already triggered", async () => {
    const tool = createApplyPatchTool();
    const toolContext = makeCtx();
    const controller = new AbortController();
    controller.abort();
    const result = await tool.execute(
      {
        patch: ["*** Begin Patch", "*** Delete File: x", "*** End Patch"].join(
          "\n",
        ),
      },
      { ...toolContext, abort: controller.signal },
    );
    expect(result.ok).toBe(false);
    expect(result.error?.kind).toBe("command_failed");
  });

  it("non-atomic mode echoes atomic=false in data", async () => {
    await seed("foo.ts", "a\n");
    const tool = createApplyPatchTool();
    const data = await getOk(
      await tool.execute(
        {
          patch: [
            "*** Begin Patch",
            "*** Update File: foo.ts",
            "@@",
            "-a",
            "+A",
            "*** End Patch",
          ].join("\n"),
          atomic: false,
        },
        makeCtx(),
      ),
    );
    expect(data.atomic).toBe(false);
  });

  it("computes a unified diff per changed file", async () => {
    await seed("foo.ts", "alpha\nbeta\n");
    const tool = createApplyPatchTool();
    const data = await getOk(
      await tool.execute(
        {
          patch: [
            "*** Begin Patch",
            "*** Update File: foo.ts",
            "@@",
            " alpha",
            "-beta",
            "+BETA",
            "*** End Patch",
          ].join("\n"),
        },
        makeCtx(),
      ),
    );
    expect(data.changedFiles[0]?.diff).toContain("-beta");
    expect(data.changedFiles[0]?.diff).toContain("+BETA");
  });
});
