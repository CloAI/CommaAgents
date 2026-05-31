import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { realpathSync } from "node:fs";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createSandbox } from "../../../sandbox/sandbox";
import type { AuditSink } from "../../io/audit.types";
import { createMemoryAuditSink } from "../../io/audit-sink";
import { sha256OfBuffer } from "../../io/hash";
import { makeToolContext } from "../../test.utils";
import type { ToolContext } from "../../tool.types";
import { type CreateFileData, createCreateFileTool } from "./index";

let workspaceRoot: string;

beforeEach(async () => {
  const base = realpathSync(tmpdir());
  workspaceRoot = await mkdtemp(join(base, "create-file-ws-"));
});

afterEach(async () => {
  await rm(workspaceRoot, { recursive: true, force: true });
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

async function getOk(
  result: Awaited<
    ReturnType<ReturnType<typeof createCreateFileTool>["execute"]>
  >,
): Promise<CreateFileData> {
  if (!result.ok) {
    throw new Error(
      `expected ok, got error: ${result.error?.kind} ${result.error?.message}`,
    );
  }
  if (!result.data) throw new Error("expected data");
  return result.data;
}

describe("createCreateFileTool", () => {
  it("returns a tool definition", () => {
    const tool = createCreateFileTool();
    expect(tool.description.length).toBeGreaterThan(0);
    expect(typeof tool.execute).toBe("function");
  });

  it("creates a new file with the given content", async () => {
    const tool = createCreateFileTool();
    const data = await getOk(
      await tool.execute({ path: "new.txt", content: "hello\n" }, makeCtx()),
    );

    expect(data.created).toBe(true);
    expect(data.path).toBe("new.txt");
    expect(data.sizeBytes).toBe(6);
    expect(data.sha256).toBe(sha256OfBuffer("hello\n"));
    expect(data.diff.length).toBeGreaterThan(0);

    const onDisk = await readFile(join(workspaceRoot, "new.txt"), "utf8");
    expect(onDisk).toBe("hello\n");
  });

  it("creates an empty file when content is the empty string", async () => {
    const tool = createCreateFileTool();
    const data = await getOk(
      await tool.execute({ path: "empty.txt", content: "" }, makeCtx()),
    );

    expect(data.sizeBytes).toBe(0);
    expect(data.sha256).toBe(sha256OfBuffer(""));
    const s = await stat(join(workspaceRoot, "empty.txt"));
    expect(s.size).toBe(0);
    expect(data.diff).toBe("");
  });

  it("fails with already_exists when the file is present", async () => {
    await writeFile(join(workspaceRoot, "exists.txt"), "x");
    const tool = createCreateFileTool();
    const result = await tool.execute(
      { path: "exists.txt", content: "y" },
      makeCtx(),
    );
    expect(result.ok).toBe(false);
    expect(result.error?.kind).toBe("already_exists");
    expect(result.error?.recoverable).toBe(true);
    expect(result.error?.suggestedNextAction).toContain("write_file");

    expect(await readFile(join(workspaceRoot, "exists.txt"), "utf8")).toBe("x");
  });

  it("fails with not_found when parent dir is missing and flag is unset", async () => {
    const tool = createCreateFileTool();
    const result = await tool.execute(
      { path: "missing/dir/file.txt", content: "x" },
      makeCtx(),
    );
    expect(result.ok).toBe(false);
    expect(result.error?.kind).toBe("not_found");
    expect(result.error?.recoverable).toBe(true);
    expect(result.error?.suggestedNextAction).toContain(
      "createParentDirectories",
    );
  });

  it("creates parent directories when createParentDirectories:true", async () => {
    const tool = createCreateFileTool();
    const data = await getOk(
      await tool.execute(
        {
          path: "deeply/nested/dir/file.txt",
          content: "hi",
          createParentDirectories: true,
        },
        makeCtx(),
      ),
    );

    expect(data.created).toBe(true);
    expect(
      await readFile(join(workspaceRoot, "deeply/nested/dir/file.txt"), "utf8"),
    ).toBe("hi");
  });

  it("fails with not_found when parent path exists but is a file", async () => {
    await writeFile(join(workspaceRoot, "blocker"), "x");
    const tool = createCreateFileTool();
    const result = await tool.execute(
      { path: "blocker/file.txt", content: "y" },
      makeCtx(),
    );
    expect(result.ok).toBe(false);
    expect(result.error?.kind).toBe("not_found");
  });

  it("rejects path traversal with outside_workspace", async () => {
    const tool = createCreateFileTool();
    const result = await tool.execute(
      { path: "../escape.txt", content: "x" },
      makeCtx({ jail: true }),
    );
    expect(result.ok).toBe(false);
    expect(result.error?.kind).toBe("outside_workspace");
  });

  it("rejects absolute paths when allowAbsolutePaths is false", async () => {
    const tool = createCreateFileTool();
    const result = await tool.execute(
      { path: join(workspaceRoot, "f.txt"), content: "x" },
      makeCtx({ allowAbsolutePaths: false }),
    );
    expect(result.ok).toBe(false);
    expect(result.error?.kind).toBe("outside_workspace");
  });

  it("rejects forbidden globs with permission_denied", async () => {
    const tool = createCreateFileTool();
    const result = await tool.execute(
      { path: "secret.env", content: "TOKEN=1" },
      makeCtx({ forbiddenGlobs: ["**/*.env"] }),
    );
    expect(result.ok).toBe(false);
    expect(result.error?.kind).toBe("permission_denied");
  });

  it("appends a successful audit entry to toolContext.auditSink", async () => {
    const sink = createMemoryAuditSink();
    const tool = createCreateFileTool();
    await getOk(
      await tool.execute(
        { path: "audited.txt", content: "abc" },
        makeCtx({ auditSink: sink, sessionId: "sess-1", agentName: "writer" }),
      ),
    );

    const entries = await sink.list();
    expect(entries.length).toBe(1);
    const entry = entries[0]!;
    expect(entry.success).toBe(true);
    expect(entry.operation).toBe("create");
    expect(entry.path).toBe("audited.txt");
    expect(entry.agentName).toBe("writer");
    expect(entry.toolName).toBe("create_file");
    expect(entry.sessionId).toBe("sess-1");
    expect(entry.afterSha256).toBe(sha256OfBuffer("abc"));
    expect(entry.beforeSha256).toBeUndefined();
    expect(entry.diff).toBeDefined();
  });

  it("falls back to factory defaultAuditSink when toolContext has none", async () => {
    const sink = createMemoryAuditSink();
    const tool = createCreateFileTool({ defaultAuditSink: sink });
    await getOk(
      await tool.execute({ path: "fallback.txt", content: "z" }, makeCtx()),
    );

    const entries = await sink.list();
    expect(entries.length).toBe(1);
    expect(entries[0]?.path).toBe("fallback.txt");
  });

  it("does not append to audit when no sink is provided anywhere", async () => {
    const tool = createCreateFileTool();
    const data = await getOk(
      await tool.execute({ path: "no-audit.txt", content: "v" }, makeCtx()),
    );
    expect(data.created).toBe(true);
  });

  it("returns command_failed when aborted before start", async () => {
    const controller = new AbortController();
    controller.abort();
    const toolContext = makeToolContext({
      sandbox: createSandbox({ cwd: workspaceRoot, jail: true }),
      abort: controller.signal,
    });

    const tool = createCreateFileTool();
    const result = await tool.execute(
      { path: "x.txt", content: "x" },
      toolContext,
    );
    expect(result.ok).toBe(false);
    expect(result.error?.kind).toBe("command_failed");
    await expect(stat(join(workspaceRoot, "x.txt"))).rejects.toThrow();
  });
});
