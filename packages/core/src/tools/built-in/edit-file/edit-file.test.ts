import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { realpathSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createSandbox } from "../../../sandbox/sandbox";
import type { AuditSink } from "../../io/audit.types";
import { createMemoryAuditSink } from "../../io/audit-sink";
import { BOM } from "../../io/bom";
import { sha256OfBuffer } from "../../io/hash";
import { makeToolContext } from "../../test.utils";
import type { ToolContext } from "../../tool.types";
import {
  createEditFileTool,
  type EditFileData,
  type MatchRange,
} from "./index";

let workspaceRoot: string;

beforeEach(async () => {
  const base = realpathSync(tmpdir());
  workspaceRoot = await mkdtemp(join(base, "edit-file-ws-"));
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
  result: Awaited<ReturnType<ReturnType<typeof createEditFileTool>["execute"]>>,
): Promise<EditFileData> {
  if (!result.ok) {
    throw new Error(
      `expected ok, got error: ${result.error?.kind} ${result.error?.message}`,
    );
  }
  if (!result.data) throw new Error("expected data");
  return result.data;
}

describe("createEditFileTool", () => {
  it("returns a tool definition", () => {
    const tool = createEditFileTool();
    expect(tool.description.length).toBeGreaterThan(0);
    expect(typeof tool.execute).toBe("function");
  });

  it("performs a single exact replacement", async () => {
    const sha = await seedFile("a.txt", "hello world\n");
    const tool = createEditFileTool();
    const data = await getOk(
      await tool.execute(
        {
          path: "a.txt",
          expectedSha256: sha,
          edits: [{ oldText: "world", newText: "there" }],
        },
        makeCtx(),
      ),
    );

    expect(data.appliedEdits).toEqual([
      {
        editIndex: 0,
        occurrences: 1,
        usedFallback: false,
        replacerName: "exactReplacer",
      },
    ]);
    expect(data.beforeSha256).toBe(sha);
    expect(data.afterSha256).toBe(sha256OfBuffer("hello there\n"));
    expect(data.diff).toContain("-hello world");
    expect(data.diff).toContain("+hello there");
    expect(await readFile(join(workspaceRoot, "a.txt"), "utf8")).toBe(
      "hello there\n",
    );
  });

  it("supports deletion when newText is empty", async () => {
    const sha = await seedFile("a.txt", "keep DROPME keep\n");
    const tool = createEditFileTool();
    await getOk(
      await tool.execute(
        {
          path: "a.txt",
          expectedSha256: sha,
          edits: [{ oldText: " DROPME", newText: "" }],
        },
        makeCtx(),
      ),
    );
    expect(await readFile(join(workspaceRoot, "a.txt"), "utf8")).toBe(
      "keep keep\n",
    );
  });

  it("fails with old_text_not_found and reports editIndex", async () => {
    const sha = await seedFile("a.txt", "abc\n");
    const tool = createEditFileTool();
    const result = await tool.execute(
      {
        path: "a.txt",
        expectedSha256: sha,
        edits: [
          { oldText: "abc", newText: "xyz" },
          { oldText: "nope", newText: "x" },
        ],
      },
      makeCtx(),
    );
    expect(result.ok).toBe(false);
    expect(result.error?.kind).toBe("old_text_not_found");
    expect(result.error?.details?.editIndex).toBe(1);
    // File must be unchanged because validation failed before write.
    expect(await readFile(join(workspaceRoot, "a.txt"), "utf8")).toBe("abc\n");
  });

  it("fails with multiple_matches and returns matchRanges", async () => {
    const sha = await seedFile("a.txt", "foo\nfoo\nfoo\n");
    const tool = createEditFileTool();
    const result = await tool.execute(
      {
        path: "a.txt",
        expectedSha256: sha,
        edits: [{ oldText: "foo", newText: "bar" }],
      },
      makeCtx(),
    );
    expect(result.ok).toBe(false);
    expect(result.error?.kind).toBe("multiple_matches");
    expect(result.error?.details?.matchCount).toBe(3);
    expect(result.error?.details?.expectedOccurrences).toBe(1);
    const ranges = result.error?.details?.matchRanges as MatchRange[];
    expect(ranges).toHaveLength(3);
    expect(ranges[0]?.startLine).toBe(1);
    expect(ranges[1]?.startLine).toBe(2);
    expect(ranges[2]?.startLine).toBe(3);
    expect(await readFile(join(workspaceRoot, "a.txt"), "utf8")).toBe(
      "foo\nfoo\nfoo\n",
    );
  });

  it("applies all occurrences when expectedOccurrences matches the count", async () => {
    const sha = await seedFile("a.txt", "foo\nfoo\nfoo\n");
    const tool = createEditFileTool();
    const data = await getOk(
      await tool.execute(
        {
          path: "a.txt",
          expectedSha256: sha,
          edits: [{ oldText: "foo", newText: "bar", expectedOccurrences: 3 }],
        },
        makeCtx(),
      ),
    );
    expect(data.appliedEdits[0]?.occurrences).toBe(3);
    expect(await readFile(join(workspaceRoot, "a.txt"), "utf8")).toBe(
      "bar\nbar\nbar\n",
    );
  });

  it("evaluates edits against the original snapshot (regression case)", async () => {
    // After edit A makes edit B's oldText appear, B must still fail.
    const sha = await seedFile("a.txt", "ALPHA gamma\n");
    const tool = createEditFileTool();
    const result = await tool.execute(
      {
        path: "a.txt",
        expectedSha256: sha,
        edits: [
          { oldText: "ALPHA", newText: "BETA" }, // would produce "BETA gamma"
          { oldText: "BETA", newText: "X" }, // not in the original snapshot
        ],
      },
      makeCtx(),
    );
    expect(result.ok).toBe(false);
    expect(result.error?.kind).toBe("old_text_not_found");
    expect(result.error?.details?.editIndex).toBe(1);
    expect(await readFile(join(workspaceRoot, "a.txt"), "utf8")).toBe(
      "ALPHA gamma\n",
    );
  });

  it("applies multiple non-overlapping edits deterministically regardless of order", async () => {
    const original = "one two three four\n";
    const sha = await seedFile("a.txt", original);
    const tool = createEditFileTool();

    // Forward order
    const data1 = await getOk(
      await tool.execute(
        {
          path: "a.txt",
          expectedSha256: sha,
          edits: [
            { oldText: "one", newText: "1" },
            { oldText: "three", newText: "3" },
          ],
        },
        makeCtx(),
      ),
    );
    expect(await readFile(join(workspaceRoot, "a.txt"), "utf8")).toBe(
      "1 two 3 four\n",
    );

    // Reset file and run in reverse order — final content must match.
    await writeFile(join(workspaceRoot, "a.txt"), original);
    const data2 = await getOk(
      await tool.execute(
        {
          path: "a.txt",
          expectedSha256: sha,
          edits: [
            { oldText: "three", newText: "3" },
            { oldText: "one", newText: "1" },
          ],
        },
        makeCtx(),
      ),
    );
    expect(await readFile(join(workspaceRoot, "a.txt"), "utf8")).toBe(
      "1 two 3 four\n",
    );
    expect(data1.afterSha256).toBe(data2.afterSha256);
  });

  it("detects overlapping edits and reports conflicting indices", async () => {
    const sha = await seedFile("a.txt", "abcdef\n");
    const tool = createEditFileTool();
    const result = await tool.execute(
      {
        path: "a.txt",
        expectedSha256: sha,
        edits: [
          { oldText: "abcd", newText: "X" },
          { oldText: "cdef", newText: "Y" }, // overlaps with first
        ],
      },
      makeCtx(),
    );
    expect(result.ok).toBe(false);
    expect(result.error?.kind).toBe("overlapping_edits");
    expect(result.error?.details?.conflictingEditIndices).toEqual([0, 1]);
    expect(await readFile(join(workspaceRoot, "a.txt"), "utf8")).toBe(
      "abcdef\n",
    );
  });

  it("fails with stale_file on hash mismatch", async () => {
    const realSha = await seedFile("a.txt", "real\n");
    const tool = createEditFileTool();
    const wrongSha = "0".repeat(64);
    const result = await tool.execute(
      {
        path: "a.txt",
        expectedSha256: wrongSha,
        edits: [{ oldText: "real", newText: "x" }],
      },
      makeCtx(),
    );
    expect(result.ok).toBe(false);
    expect(result.error?.kind).toBe("stale_file");
    expect(result.error?.details?.actualSha256).toBe(realSha);
    expect(result.error?.details?.expectedSha256).toBe(wrongSha);
    expect(result.error?.suggestedNextAction).toContain("Re-read");
  });

  it("fails with not_found when the file is missing", async () => {
    const tool = createEditFileTool();
    const result = await tool.execute(
      {
        path: "missing.txt",
        expectedSha256: sha256OfBuffer(""),
        edits: [{ oldText: "x", newText: "y" }],
      },
      makeCtx(),
    );
    expect(result.ok).toBe(false);
    expect(result.error?.kind).toBe("not_found");
  });

  it("fails with not_found when the path is a directory", async () => {
    await mkdir(join(workspaceRoot, "dir"));
    const tool = createEditFileTool();
    const result = await tool.execute(
      {
        path: "dir",
        expectedSha256: sha256OfBuffer(""),
        edits: [{ oldText: "x", newText: "y" }],
      },
      makeCtx(),
    );
    expect(result.ok).toBe(false);
    expect(result.error?.kind).toBe("not_found");
  });

  it("rejects binary files with binary_file", async () => {
    // A buffer with an embedded NUL byte triggers the heuristic.
    const bin = new Uint8Array([0x68, 0x69, 0x00, 0x21]); // "hi\0!"
    const sha = await seedFile("img.bin", bin);
    const tool = createEditFileTool();
    const result = await tool.execute(
      {
        path: "img.bin",
        expectedSha256: sha,
        edits: [{ oldText: "hi", newText: "yo" }],
      },
      makeCtx(),
    );
    expect(result.ok).toBe(false);
    expect(result.error?.kind).toBe("binary_file");
  });

  it("preserves CRLF newline style", async () => {
    const original = "alpha\r\nbeta\r\n";
    const sha = await seedFile("crlf.txt", original);
    const tool = createEditFileTool();
    // Caller provides LF-only oldText/newText; tool normalizes.
    await getOk(
      await tool.execute(
        {
          path: "crlf.txt",
          expectedSha256: sha,
          edits: [{ oldText: "alpha\nbeta", newText: "one\ntwo" }],
        },
        makeCtx(),
      ),
    );
    expect(await readFile(join(workspaceRoot, "crlf.txt"), "utf8")).toBe(
      "one\r\ntwo\r\n",
    );
  });

  it("preserves leading BOM when present", async () => {
    const original = `${BOM}hello\n`;
    const sha = await seedFile("bom.txt", original);
    const tool = createEditFileTool();
    await getOk(
      await tool.execute(
        {
          path: "bom.txt",
          expectedSha256: sha,
          edits: [{ oldText: "hello", newText: "world" }],
        },
        makeCtx(),
      ),
    );
    expect(await readFile(join(workspaceRoot, "bom.txt"), "utf8")).toBe(
      `${BOM}world\n`,
    );
  });

  it("rejects path traversal with outside_workspace", async () => {
    const tool = createEditFileTool();
    const result = await tool.execute(
      {
        path: "../escape.txt",
        expectedSha256: sha256OfBuffer(""),
        edits: [{ oldText: "x", newText: "y" }],
      },
      makeCtx({ jail: true }),
    );
    expect(result.ok).toBe(false);
    expect(result.error?.kind).toBe("outside_workspace");
  });

  it("rejects forbidden globs with permission_denied", async () => {
    const sha = await seedFile("secret.env", "TOKEN=1");
    const tool = createEditFileTool();
    const result = await tool.execute(
      {
        path: "secret.env",
        expectedSha256: sha,
        edits: [{ oldText: "1", newText: "2" }],
      },
      makeCtx({ forbiddenGlobs: ["**/*.env"] }),
    );
    expect(result.ok).toBe(false);
    expect(result.error?.kind).toBe("permission_denied");
  });

  it("rejects invalid expectedSha256 format at the schema layer", async () => {
    await seedFile("a.txt", "x");
    const tool = createEditFileTool();
    expect(() =>
      tool.parameters.parse({
        path: "a.txt",
        expectedSha256: "not-a-hash",
        edits: [{ oldText: "x", newText: "y" }],
      }),
    ).toThrow();
  });

  it("rejects empty edits array at the schema layer", () => {
    const tool = createEditFileTool();
    expect(() =>
      tool.parameters.parse({
        path: "a.txt",
        expectedSha256: sha256OfBuffer(""),
        edits: [],
      }),
    ).toThrow();
  });

  it("appends a successful update audit entry", async () => {
    const sha = await seedFile("audited.txt", "v1\n");
    const sink = createMemoryAuditSink();
    const tool = createEditFileTool();
    await getOk(
      await tool.execute(
        {
          path: "audited.txt",
          expectedSha256: sha,
          edits: [{ oldText: "v1", newText: "v2" }],
        },
        makeCtx({ auditSink: sink, sessionId: "sess-1", agentName: "editor" }),
      ),
    );

    const entries = await sink.list();
    expect(entries.length).toBe(1);
    const entry = entries[0]!;
    expect(entry.success).toBe(true);
    expect(entry.operation).toBe("update");
    expect(entry.toolName).toBe("edit_file");
    expect(entry.agentName).toBe("editor");
    expect(entry.sessionId).toBe("sess-1");
    expect(entry.beforeSha256).toBe(sha);
    expect(entry.afterSha256).toBe(sha256OfBuffer("v2\n"));
    expect(entry.diff).toContain("v1");
    expect(entry.diff).toContain("v2");
  });

  it("falls back to factory defaultAuditSink when ctx has none", async () => {
    const sha = await seedFile("fb.txt", "a");
    const sink = createMemoryAuditSink();
    const tool = createEditFileTool({ defaultAuditSink: sink });
    await getOk(
      await tool.execute(
        {
          path: "fb.txt",
          expectedSha256: sha,
          edits: [{ oldText: "a", newText: "b" }],
        },
        makeCtx(),
      ),
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
    const tool = createEditFileTool();
    const result = await tool.execute(
      {
        path: "a.txt",
        expectedSha256: sha,
        edits: [{ oldText: "x", newText: "y" }],
      },
      toolContext,
    );
    expect(result.ok).toBe(false);
    expect(result.error?.kind).toBe("command_failed");
    expect(await readFile(join(workspaceRoot, "a.txt"), "utf8")).toBe("x");
  });

  describe("optional expectedSha256 + fallback matching", () => {
    it("succeeds without expectedSha256 (no staleness chain)", async () => {
      await seedFile("a.ts", "const x = 1;\n");
      const tool = createEditFileTool();
      const result = await tool.execute(
        {
          path: "a.ts",
          // expectedSha256 omitted
          edits: [{ oldText: "const x = 1;", newText: "const x = 2;" }],
        },
        makeCtx(),
      );
      const data = await getOk(result);
      expect(data.appliedEdits[0]?.occurrences).toBe(1);
      expect(data.appliedEdits[0]?.usedFallback).toBeFalsy();
      expect(await readFile(join(workspaceRoot, "a.ts"), "utf8")).toBe(
        "const x = 2;\n",
      );
    });

    it("recovers via line-trimmed fallback when LLM indented oldText slightly off", async () => {
      // File has 4-space indent; LLM gave us a tab-indented version.
      await seedFile("a.ts", "function f() {\n    return 1;\n}\n");
      const tool = createEditFileTool();
      const result = await tool.execute(
        {
          path: "a.ts",
          edits: [
            {
              oldText: "function f() {\n\treturn 1;\n}",
              newText: "function f() {\n    return 2;\n}",
            },
          ],
        },
        makeCtx(),
      );
      const data = await getOk(result);
      expect(data.appliedEdits[0]?.usedFallback).toBe(true);
      expect(data.appliedEdits[0]?.replacerName).toBe("lineTrimmedReplacer");
      const updated = await readFile(join(workspaceRoot, "a.ts"), "utf8");
      expect(updated).toContain("return 2;");
      expect(updated).not.toContain("return 1;");
    });

    it("recovers a multi-line block when leading indent drifts", async () => {
      await seedFile(
        "a.ts",
        "  function greet(name) {\n    console.log(`hi ${name}`);\n    return name;\n  }\n",
      );
      const tool = createEditFileTool();
      // LLM dropped the leading indent on every line.
      const result = await tool.execute(
        {
          path: "a.ts",
          edits: [
            {
              oldText:
                "function greet(name) {\n  console.log(`hi ${name}`);\n  return name;\n}",
              newText:
                "function greet(name) {\n  console.log(`hello ${name}`);\n  return name;\n}",
            },
          ],
        },
        makeCtx(),
      );
      const data = await getOk(result);
      expect(data.appliedEdits[0]?.usedFallback).toBe(true);
      const updated = await readFile(join(workspaceRoot, "a.ts"), "utf8");
      expect(updated).toContain("hello ${name}");
      expect(updated).not.toContain("hi ${name}");
    });

    it("uses block-anchor fallback when middle of a block differs", async () => {
      await seedFile(
        "a.ts",
        "function f() {\n  const a = 1;\n  const b = 2;\n  return a + b;\n}\n",
      );
      const tool = createEditFileTool();
      // LLM rewrote the body slightly but kept the first and last lines.
      const result = await tool.execute(
        {
          path: "a.ts",
          edits: [
            {
              oldText:
                "function f() {\n  // anything different here\n  return a + b;\n}",
              newText: "function f() {\n  return 42;\n}",
            },
          ],
        },
        makeCtx(),
      );
      const data = await getOk(result);
      expect(data.appliedEdits[0]?.usedFallback).toBe(true);
      expect(data.appliedEdits[0]?.replacerName).toBe("blockAnchorReplacer");
      const updated = await readFile(join(workspaceRoot, "a.ts"), "utf8");
      expect(updated).toContain("return 42;");
    });

    it("still enforces expectedSha256 when explicitly provided", async () => {
      await seedFile("a.ts", "x");
      const tool = createEditFileTool();
      const result = await tool.execute(
        {
          path: "a.ts",
          expectedSha256: "0".repeat(64),
          edits: [{ oldText: "x", newText: "y" }],
        },
        makeCtx(),
      );
      expect(result.ok).toBe(false);
      expect(result.error?.kind).toBe("stale_file");
    });

    it("still reports old_text_not_found when no replacer matches", async () => {
      await seedFile("a.ts", "function f() {}\n");
      const tool = createEditFileTool();
      const result = await tool.execute(
        {
          path: "a.ts",
          edits: [
            {
              oldText: "function notInFile() {}",
              newText: "function whatever() {}",
            },
          ],
        },
        makeCtx(),
      );
      expect(result.ok).toBe(false);
      expect(result.error?.kind).toBe("old_text_not_found");
      expect(result.error?.recoverable).toBe(true);
    });
  });
});
