import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { existsSync, realpathSync } from "node:fs";
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
import { createDeleteFileTool, type DeleteFileData } from "./index";

let workspaceRoot: string;

beforeEach(async () => {
  const base = realpathSync(tmpdir());
  workspaceRoot = await mkdtemp(join(base, "delete-file-ws-"));
});

afterEach(async () => {
  await rm(workspaceRoot, { recursive: true, force: true });
  // Clean this workspace's trash bucket so tests don't leak.
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
  await writeFile(abs, content);
  const buf =
    typeof content === "string" ? new TextEncoder().encode(content) : content;
  return sha256OfBuffer(buf);
}

async function getOk(
  result: Awaited<
    ReturnType<ReturnType<typeof createDeleteFileTool>["execute"]>
  >,
): Promise<DeleteFileData> {
  if (!result.ok) {
    throw new Error(
      `expected ok, got error: ${result.error?.kind} ${result.error?.message}`,
    );
  }
  if (!result.data) throw new Error("expected data");
  return result.data;
}

describe("createDeleteFileTool", () => {
  it("returns a tool definition", () => {
    const tool = createDeleteFileTool();
    expect(tool.description.length).toBeGreaterThan(0);
    expect(typeof tool.execute).toBe("function");
  });

  it("trashes the file by default as a tar.gz archive and records trashedTo", async () => {
    const sha = await seedFile("a.txt", "bye\n");
    const tool = createDeleteFileTool();
    const data = await getOk(
      await tool.execute({ path: "a.txt", expectedSha256: sha }, makeCtx()),
    );

    expect(data.deleted).toBe(true);
    expect(data.permanent).toBe(false);
    expect(data.beforeSha256).toBe(sha);
    expect(data.sizeBytes).toBe(4);
    expect(typeof data.trashedTo).toBe("string");
    expect(data.trashedTo).toEndWith(".tar.gz");
    expect(existsSync(join(workspaceRoot, "a.txt"))).toBe(false);
    expect(existsSync(data.trashedTo!)).toBe(true);
  });

  it("unlinks the file permanently when permanent: true", async () => {
    const sha = await seedFile("p.txt", "x");
    const tool = createDeleteFileTool();
    const data = await getOk(
      await tool.execute(
        { path: "p.txt", expectedSha256: sha, permanent: true },
        makeCtx(),
      ),
    );
    expect(data.permanent).toBe(true);
    expect(data.trashedTo).toBeUndefined();
    expect(existsSync(join(workspaceRoot, "p.txt"))).toBe(false);
  });

  it("fails with stale_file on hash mismatch and leaves the file intact", async () => {
    const realSha = await seedFile("a.txt", "intact\n");
    const tool = createDeleteFileTool();
    const wrong = "0".repeat(64);
    const result = await tool.execute(
      { path: "a.txt", expectedSha256: wrong },
      makeCtx(),
    );
    expect(result.ok).toBe(false);
    expect(result.error?.kind).toBe("stale_file");
    expect(result.error?.details?.actualSha256).toBe(realSha);
    expect(result.error?.suggestedNextAction).toContain("Re-read");
    expect(await readFile(join(workspaceRoot, "a.txt"), "utf8")).toBe(
      "intact\n",
    );
  });

  it("fails with not_found when the file is missing", async () => {
    const tool = createDeleteFileTool();
    const result = await tool.execute(
      { path: "missing.txt", expectedSha256: sha256OfBuffer("") },
      makeCtx(),
    );
    expect(result.ok).toBe(false);
    expect(result.error?.kind).toBe("not_found");
  });

  it("fails with not_found when the path is a directory", async () => {
    await mkdir(join(workspaceRoot, "dir"));
    const tool = createDeleteFileTool();
    const result = await tool.execute(
      { path: "dir", expectedSha256: sha256OfBuffer("") },
      makeCtx(),
    );
    expect(result.ok).toBe(false);
    expect(result.error?.kind).toBe("not_found");
  });

  it("rejects path traversal with outside_workspace", async () => {
    const tool = createDeleteFileTool();
    const result = await tool.execute(
      { path: "../escape.txt", expectedSha256: sha256OfBuffer("") },
      makeCtx({ jail: true }),
    );
    expect(result.ok).toBe(false);
    expect(result.error?.kind).toBe("outside_workspace");
  });

  it("rejects forbidden globs with permission_denied", async () => {
    const sha = await seedFile("secret.env", "TOKEN=1");
    const tool = createDeleteFileTool();
    const result = await tool.execute(
      { path: "secret.env", expectedSha256: sha },
      makeCtx({ forbiddenGlobs: ["**/*.env"] }),
    );
    expect(result.ok).toBe(false);
    expect(result.error?.kind).toBe("permission_denied");
    expect(existsSync(join(workspaceRoot, "secret.env"))).toBe(true);
  });

  it("rejects invalid expectedSha256 format at the schema layer", () => {
    const tool = createDeleteFileTool();
    expect(() =>
      tool.parameters.parse({ path: "a.txt", expectedSha256: "not-a-hash" }),
    ).toThrow();
  });

  it("appends a delete audit entry with trashedTo in details", async () => {
    const sha = await seedFile("audited.txt", "v\n");
    const sink = createMemoryAuditSink();
    const tool = createDeleteFileTool();
    const data = await getOk(
      await tool.execute(
        { path: "audited.txt", expectedSha256: sha },
        makeCtx({ auditSink: sink, sessionId: "s1", agentName: "deleter" }),
      ),
    );

    const entries = await sink.list();
    expect(entries.length).toBe(1);
    const entry = entries[0]!;
    expect(entry.success).toBe(true);
    expect(entry.operation).toBe("delete");
    expect(entry.toolName).toBe("delete_file");
    expect(entry.agentName).toBe("deleter");
    expect(entry.sessionId).toBe("s1");
    expect(entry.beforeSha256).toBe(sha);
    expect(entry.afterSha256).toBeUndefined();
    expect(entry.details?.permanent).toBe(false);
    expect(entry.details?.trashedTo).toBe(data.trashedTo!);
  });

  it("audit entry omits trashedTo when permanent", async () => {
    const sha = await seedFile("p.txt", "x");
    const sink = createMemoryAuditSink();
    const tool = createDeleteFileTool();
    await getOk(
      await tool.execute(
        { path: "p.txt", expectedSha256: sha, permanent: true },
        makeCtx({ auditSink: sink }),
      ),
    );
    const entries = await sink.list();
    expect(entries[0]?.details?.permanent).toBe(true);
    expect(entries[0]?.details?.trashedTo).toBeUndefined();
  });

  it("falls back to factory defaultAuditSink when toolContext has none", async () => {
    const sha = await seedFile("fb.txt", "a");
    const sink = createMemoryAuditSink();
    const tool = createDeleteFileTool({ defaultAuditSink: sink });
    await getOk(
      await tool.execute({ path: "fb.txt", expectedSha256: sha }, makeCtx()),
    );
    const entries = await sink.list();
    expect(entries.length).toBe(1);
    expect(entries[0]?.path).toBe("fb.txt");
  });

  it("returns command_failed when aborted before start", async () => {
    const sha = await seedFile("a.txt", "x");
    const controller = new AbortController();
    controller.abort();
    const toolContext = makeToolContext({
      sandbox: createSandbox({ cwd: workspaceRoot, jail: true }),
      abort: controller.signal,
    });
    const tool = createDeleteFileTool();
    const result = await tool.execute(
      { path: "a.txt", expectedSha256: sha },
      toolContext,
    );
    expect(result.ok).toBe(false);
    expect(result.error?.kind).toBe("command_failed");
    expect(existsSync(join(workspaceRoot, "a.txt"))).toBe(true);
  });
});
