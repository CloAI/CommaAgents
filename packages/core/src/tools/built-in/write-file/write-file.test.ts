import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { realpathSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createSandbox } from "../../../sandbox/sandbox";
import type { AuditSink } from "../../io/audit";
import { createMemoryAuditSink } from "../../io/audit-sink";
import { BOM } from "../../io/bom";
import { sha256OfBuffer } from "../../io/hash";
import { makeToolContext } from "../../test.utils";
import type { ToolContext } from "../../tool.types";
import { createWriteFileTool, type WriteFileData } from "./index";

let workspaceRoot: string;

beforeEach(async () => {
  const base = realpathSync(tmpdir());
  workspaceRoot = await mkdtemp(join(base, "write-file-ws-"));
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

async function seedFile(
  relPath: string,
  content: string | Uint8Array,
): Promise<string> {
  const abs = join(workspaceRoot, relPath);
  await writeFile(abs, content);
  const buf =
    typeof content === "string" ? new TextEncoder().encode(content) : content;
  return sha256OfBuffer(buf);
}

async function getOk(
  result: Awaited<
    ReturnType<ReturnType<typeof createWriteFileTool>["execute"]>
  >,
): Promise<WriteFileData> {
  if (!result.ok) {
    throw new Error(
      `expected ok, got error: ${result.error?.kind} ${result.error?.message}`,
    );
  }
  if (!result.data) throw new Error("expected data");
  return result.data;
}

describe("createWriteFileTool", () => {
  it("returns a tool definition", () => {
    const tool = createWriteFileTool();
    expect(tool.description.length).toBeGreaterThan(0);
    expect(typeof tool.execute).toBe("function");
  });

  it("replaces an existing file when expectedSha256 matches", async () => {
    const sha = await seedFile("a.txt", "before\n");
    const tool = createWriteFileTool();
    const data = await getOk(
      await tool.execute(
        { path: "a.txt", content: "after\n", expectedSha256: sha },
        makeCtx(),
      ),
    );

    expect(data.path).toBe("a.txt");
    expect(data.beforeSha256).toBe(sha);
    expect(data.afterSha256).toBe(sha256OfBuffer("after\n"));
    expect(data.sizeBytes).toBe(6);
    expect(data.diff).toContain("-before");
    expect(data.diff).toContain("+after");

    expect(await readFile(join(workspaceRoot, "a.txt"), "utf8")).toBe(
      "after\n",
    );
  });

  it("fails with stale_file on hash mismatch and exposes actualSha256", async () => {
    const realSha = await seedFile("a.txt", "real content\n");
    const tool = createWriteFileTool();
    const wrongSha = "0".repeat(64);

    const result = await tool.execute(
      { path: "a.txt", content: "x\n", expectedSha256: wrongSha },
      makeCtx(),
    );

    expect(result.ok).toBe(false);
    expect(result.error?.kind).toBe("stale_file");
    expect(result.error?.recoverable).toBe(true);
    expect(result.error?.suggestedNextAction).toContain("Re-read");
    expect(result.error?.details?.actualSha256).toBe(realSha);
    expect(result.error?.details?.expectedSha256).toBe(wrongSha);

    expect(await readFile(join(workspaceRoot, "a.txt"), "utf8")).toBe(
      "real content\n",
    );
  });

  it("fails with not_found when the target does not exist", async () => {
    const tool = createWriteFileTool();
    const result = await tool.execute(
      {
        path: "nope.txt",
        content: "x",
        expectedSha256: sha256OfBuffer(""),
      },
      makeCtx(),
    );
    expect(result.ok).toBe(false);
    expect(result.error?.kind).toBe("not_found");
    expect(result.error?.suggestedNextAction).toContain("create_file");
  });

  it("fails with not_found when the path is a directory", async () => {
    await mkdir(join(workspaceRoot, "dir"));
    const tool = createWriteFileTool();
    const result = await tool.execute(
      { path: "dir", content: "x", expectedSha256: sha256OfBuffer("") },
      makeCtx(),
    );
    expect(result.ok).toBe(false);
    expect(result.error?.kind).toBe("not_found");
  });

  it("does NOT auto-create parent directories", async () => {
    const tool = createWriteFileTool();
    const result = await tool.execute(
      {
        path: "missing/dir/file.txt",
        content: "x",
        expectedSha256: sha256OfBuffer(""),
      },
      makeCtx(),
    );
    expect(result.ok).toBe(false);
    expect(result.error?.kind).toBe("not_found");
    expect(result.error?.suggestedNextAction).toContain("create_file");
  });

  it("preserves CRLF newline style when the existing file used CRLF", async () => {
    const original = "line1\r\nline2\r\n";
    const sha = await seedFile("crlf.txt", original);
    const tool = createWriteFileTool();
    await getOk(
      await tool.execute(
        { path: "crlf.txt", content: "alpha\nbeta\n", expectedSha256: sha },
        makeCtx(),
      ),
    );

    const onDisk = await readFile(join(workspaceRoot, "crlf.txt"), "utf8");
    expect(onDisk).toBe("alpha\r\nbeta\r\n");
  });

  it("preserves leading BOM when the existing file had one", async () => {
    const original = `${BOM}hello\n`;
    const sha = await seedFile("bom.txt", original);
    const tool = createWriteFileTool();
    await getOk(
      await tool.execute(
        { path: "bom.txt", content: "world\n", expectedSha256: sha },
        makeCtx(),
      ),
    );

    const onDisk = await readFile(join(workspaceRoot, "bom.txt"), "utf8");
    expect(onDisk).toBe(`${BOM}world\n`);
  });

  it("does NOT add a BOM when the existing file had none", async () => {
    const sha = await seedFile("plain.txt", "hello\n");
    const tool = createWriteFileTool();
    await getOk(
      await tool.execute(
        { path: "plain.txt", content: `${BOM}world\n`, expectedSha256: sha },
        makeCtx(),
      ),
    );

    const onDisk = await readFile(join(workspaceRoot, "plain.txt"), "utf8");
    expect(onDisk).toBe("world\n");
  });

  it("rejects path traversal with outside_workspace", async () => {
    const tool = createWriteFileTool();
    const result = await tool.execute(
      {
        path: "../escape.txt",
        content: "x",
        expectedSha256: sha256OfBuffer(""),
      },
      makeCtx({ jail: true }),
    );
    expect(result.ok).toBe(false);
    expect(result.error?.kind).toBe("outside_workspace");
  });

  it("rejects forbidden globs with permission_denied", async () => {
    await seedFile("secret.env", "TOKEN=1");
    const tool = createWriteFileTool();
    const result = await tool.execute(
      {
        path: "secret.env",
        content: "x",
        expectedSha256: sha256OfBuffer("TOKEN=1"),
      },
      makeCtx({ forbiddenGlobs: ["**/*.env"] }),
    );
    expect(result.ok).toBe(false);
    expect(result.error?.kind).toBe("permission_denied");
  });

  it("rejects invalid expectedSha256 format at the schema layer", async () => {
    await seedFile("a.txt", "x");
    const tool = createWriteFileTool();
    expect(() =>
      tool.parameters.parse({
        path: "a.txt",
        content: "y",
        expectedSha256: "not-a-hash",
      }),
    ).toThrow();
  });

  it("appends a successful update audit entry", async () => {
    const sha = await seedFile("audited.txt", "v1\n");
    const sink = createMemoryAuditSink();
    const tool = createWriteFileTool();
    await getOk(
      await tool.execute(
        { path: "audited.txt", content: "v2\n", expectedSha256: sha },
        makeCtx({ auditSink: sink, sessionId: "sess-1", agentName: "writer" }),
      ),
    );

    const entries = await sink.list();
    expect(entries.length).toBe(1);
    const entry = entries[0]!;
    expect(entry.success).toBe(true);
    expect(entry.operation).toBe("update");
    expect(entry.path).toBe("audited.txt");
    expect(entry.toolName).toBe("write_file");
    expect(entry.agentName).toBe("writer");
    expect(entry.sessionId).toBe("sess-1");
    expect(entry.beforeSha256).toBe(sha);
    expect(entry.afterSha256).toBe(sha256OfBuffer("v2\n"));
    expect(entry.diff).toContain("v2");
  });

  it("falls back to factory defaultAuditSink when ctx has none", async () => {
    const sha = await seedFile("fallback.txt", "a");
    const sink = createMemoryAuditSink();
    const tool = createWriteFileTool({ defaultAuditSink: sink });
    await getOk(
      await tool.execute(
        { path: "fallback.txt", content: "b", expectedSha256: sha },
        makeCtx(),
      ),
    );
    const entries = await sink.list();
    expect(entries.length).toBe(1);
    expect(entries[0]!.path).toBe("fallback.txt");
  });

  it("handles a no-op write (content unchanged)", async () => {
    const sha = await seedFile("same.txt", "stay\n");
    const tool = createWriteFileTool();
    const data = await getOk(
      await tool.execute(
        { path: "same.txt", content: "stay\n", expectedSha256: sha },
        makeCtx(),
      ),
    );

    expect(data.beforeSha256).toBe(data.afterSha256);
    expect(data.diff).toBe("");
  });

  it("returns command_failed when aborted before start", async () => {
    const sha = await seedFile("a.txt", "x");
    const controller = new AbortController();
    controller.abort();
    const toolContext = makeToolContext({
      sandbox: createSandbox({ cwd: workspaceRoot, jail: true }),
      abort: controller.signal,
    });
    const tool = createWriteFileTool();
    const result = await tool.execute(
      { path: "a.txt", content: "y", expectedSha256: sha },
      toolContext,
    );
    expect(result.ok).toBe(false);
    expect(result.error?.kind).toBe("command_failed");
    expect(await readFile(join(workspaceRoot, "a.txt"), "utf8")).toBe("x");
  });
});
