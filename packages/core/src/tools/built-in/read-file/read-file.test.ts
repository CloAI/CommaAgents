import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { realpathSync } from "node:fs";
import * as fsPromises from "node:fs/promises";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createSandbox } from "../../../sandbox/sandbox";
import { sha256OfBuffer } from "../../io";
import { makeToolContext } from "../../test.utils";
import type { ToolContext } from "../../tool.types";
import { createReadFileTool, type ReadFileData } from "./index";

vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();
  return { ...actual, open: vi.fn(actual.open) };
});

let workspaceRoot: string;
let outsideRoot: string;

beforeEach(async () => {
  // realpath avoids the macOS /tmp to /private/tmp symlink crossing the boundary.
  const base = realpathSync(tmpdir());
  workspaceRoot = await mkdtemp(join(base, "read-file-ws-"));
  outsideRoot = await mkdtemp(join(base, "read-file-outside-"));
});

afterEach(async () => {
  vi.restoreAllMocks();
  await rm(workspaceRoot, { recursive: true, force: true });
  await rm(outsideRoot, { recursive: true, force: true });
});

function makeCtx(overrides?: {
  outsideWorkspace?: "allow" | "deny";
  absolutePaths?: "allow" | "deny";
  forbiddenGlobs?: readonly string[];
}): ToolContext {
  return makeToolContext({
    sandbox: createSandbox({
      cwd: workspaceRoot,
      outsideWorkspace: overrides?.outsideWorkspace ?? "deny",
      absolutePaths: overrides?.absolutePaths ?? "deny",
      forbiddenGlobs: overrides?.forbiddenGlobs ?? [],
    }),
  });
}

async function getOk(
  result: Awaited<ReturnType<ReturnType<typeof createReadFileTool>["execute"]>>,
): Promise<ReadFileData> {
  if (!result.ok) {
    throw new Error(
      `expected ok, got error: ${result.error?.kind} ${result.error?.message}`,
    );
  }
  if (!result.data) {
    throw new Error("expected data");
  }
  return result.data;
}

describe("createReadFileTool", () => {
  describe("metadata", () => {
    it("returns a tool definition with description and parameters", () => {
      const tool = createReadFileTool();
      expect(tool.description.length).toBeGreaterThan(0);
      expect(typeof tool.execute).toBe("function");
    });
  });

  describe("text reads", () => {
    it("reads a UTF-8 file and reports correct sha256, lineCount, sizeBytes", async () => {
      const path = "hello.txt";
      const text = "line one\nline two\nline three\n";
      await writeFile(join(workspaceRoot, path), text);

      const tool = createReadFileTool();
      const data = await getOk(await tool.execute({ path }, makeCtx()));

      expect(data.content).toBe(text);
      expect(data.sha256).toBe(sha256OfBuffer(text));
      expect(data.sizeBytes).toBe(Buffer.byteLength(text, "utf8"));
      // "a\nb\nc\n".split("\n") yields ["a","b","c",""] → lineCount 4
      expect(data.lineCount).toBe(4);
      expect(data.startLine).toBe(1);
      expect(data.endLine).toBe(4);
      expect(data.truncated).toBe(false);
    });

    it("slices by startLine/endLine inclusive (1-indexed)", async () => {
      const path = "lines.txt";
      const text = "a\nb\nc\nd\ne";
      await writeFile(join(workspaceRoot, path), text);

      const tool = createReadFileTool();
      const data = await getOk(
        await tool.execute({ path, startLine: 2, endLine: 4 }, makeCtx()),
      );

      expect(data.content).toBe("b\nc\nd");
      expect(data.startLine).toBe(2);
      expect(data.endLine).toBe(4);
      expect(data.lineCount).toBe(5);
      // sha256 covers full file even when sliced
      expect(data.sha256).toBe(sha256OfBuffer(text));
    });

    it("clamps endLine past EOF and handles startLine=1", async () => {
      const path = "lines.txt";
      const text = "a\nb\nc";
      await writeFile(join(workspaceRoot, path), text);

      const tool = createReadFileTool();
      const data = await getOk(
        await tool.execute({ path, startLine: 1, endLine: 999 }, makeCtx()),
      );

      expect(data.content).toBe("a\nb\nc");
      expect(data.endLine).toBe(3);
    });

    it("returns empty content when startLine is past EOF", async () => {
      const path = "lines.txt";
      await writeFile(join(workspaceRoot, path), "a\nb\nc");

      const tool = createReadFileTool();
      const data = await getOk(
        await tool.execute({ path, startLine: 99 }, makeCtx()),
      );

      expect(data.content).toBe("");
      expect(data.startLine).toBe(99);
    });

    it("should cap the complete output at whole lines and report its actual range", async () => {
      const path = "big.txt";
      const text = Array.from({ length: 20 }, () => "🙂".repeat(10)).join("\n");
      await writeFile(join(workspaceRoot, path), text);
      const result = await createReadFileTool({ maxOutputBytes: 240 }).execute(
        { path },
        makeCtx(),
      );
      const data = await getOk(result);
      expect(data.truncated).toBe(true);
      expect(Buffer.byteLength(result.output!)).toBeLessThanOrEqual(240);
      expect(data.endLine).toBe(data.content.split("\n").length);
      expect(
        data.content.split("\n").every((line) => line === "🙂".repeat(10)),
      ).toBe(true);
      expect(data.sha256).toBe(sha256OfBuffer(text));
      const next = await getOk(
        await createReadFileTool().execute(
          { path, startLine: data.endLine + 1 },
          makeCtx(),
        ),
      );
      expect(next.startLine).toBe(data.endLine + 1);
    });

    it("should reject a first line that cannot fit instead of splitting it", async () => {
      await writeFile(join(workspaceRoot, "long.txt"), "x".repeat(500));
      const result = await createReadFileTool({ maxOutputBytes: 200 }).execute(
        { path: "long.txt" },
        makeCtx(),
      );
      expect(result.error?.kind).toBe("file_too_large");
      expect(result.error?.suggestedNextAction).toBeTruthy();
    });

    it("should reject a reversed line range", async () => {
      const tool = createReadFileTool();
      expect(
        (await tool.execute({ path: "a", startLine: 4, endLine: 2 }, makeCtx()))
          .ok,
      ).toBe(false);
    });

    it("should remove binary and caller byte-limit parameters", () => {
      const params = createReadFileTool().parameters;
      expect(params.safeParse({ path: "a", allowBinary: true }).success).toBe(
        false,
      );
      expect(params.safeParse({ path: "a", maxBytes: 100 }).success).toBe(
        false,
      );
    });

    it("should enforce the configured file limit even for line slices", async () => {
      await writeFile(join(workspaceRoot, "large.txt"), "a\n".repeat(30));
      const result = await createReadFileTool({ maxFileBytes: 50 }).execute(
        { path: "large.txt", endLine: 1 },
        makeCtx(),
      );
      expect(result.error?.kind).toBe("file_too_large");
    });

    it("should accept files exactly at the configured file limit", async () => {
      await writeFile(join(workspaceRoot, "exact.txt"), "a".repeat(50));
      const result = await createReadFileTool({ maxFileBytes: 50 }).execute(
        { path: "exact.txt" },
        makeCtx(),
      );
      expect(result.ok).toBe(true);
      expect(result.data?.sizeBytes).toBe(50);
    });

    it("should preserve empty-file content and metadata", async () => {
      await writeFile(join(workspaceRoot, "empty.txt"), "");
      const data = await getOk(
        await createReadFileTool().execute({ path: "empty.txt" }, makeCtx()),
      );
      expect(data.content).toBe("");
      expect(data.startLine).toBe(1);
      expect(data.endLine).toBe(1);
      expect(data.sizeBytes).toBe(0);
      expect(data.truncated).toBe(false);
    });

    it("should stop after maxFileBytes plus one when the file grows", async () => {
      await writeFile(join(workspaceRoot, "growing.txt"), "a");
      let bytesRead = 0;
      const close = vi.fn(async () => undefined);
      const handle = {
        stat: async () => ({
          size: 1,
          isDirectory: () => false,
          isFile: () => true,
        }),
        read: async (buffer: Buffer, offset: number, length: number) => {
          bytesRead += length;
          buffer.fill(97, offset, offset + length);
          return { bytesRead: length, buffer };
        },
        close,
      };
      vi.mocked(fsPromises.open).mockResolvedValueOnce(
        handle as unknown as Awaited<ReturnType<typeof fsPromises.open>>,
      );
      const result = await createReadFileTool({ maxFileBytes: 100 }).execute(
        { path: "growing.txt" },
        makeCtx(),
      );
      expect(result.error?.kind).toBe("file_too_large");
      expect(bytesRead).toBe(101);
      expect(close).toHaveBeenCalledOnce();
    });

    it("should propagate cancellation during reading and close the handle", async () => {
      await writeFile(join(workspaceRoot, "abort.txt"), "a");
      const controller = new AbortController();
      const close = vi.fn(async () => undefined);
      const handle = {
        stat: async () => ({
          size: 1,
          isDirectory: () => false,
          isFile: () => true,
        }),
        read: async () => {
          controller.abort();
          return { bytesRead: 0 };
        },
        close,
      };
      vi.mocked(fsPromises.open).mockResolvedValueOnce(
        handle as unknown as Awaited<ReturnType<typeof fsPromises.open>>,
      );
      await expect(
        createReadFileTool().execute(
          { path: "abort.txt" },
          { ...makeCtx(), abort: controller.signal },
        ),
      ).rejects.toMatchObject({ name: "AbortError" });
      expect(close).toHaveBeenCalledOnce();
    });
  });

  it("should normalize BOM and CRLF while hashing the original bytes", async () => {
    const raw = "\uFEFFa\r\nb\r\n";
    await writeFile(join(workspaceRoot, "bom.txt"), raw);
    const data = await getOk(
      await createReadFileTool().execute({ path: "bom.txt" }, makeCtx()),
    );
    expect(data.content).toBe("a\nb\n");
    expect(data.sha256).toBe(sha256OfBuffer(raw));
    expect(Object.keys(data).sort()).toEqual([
      "content",
      "endLine",
      "lineCount",
      "sha256",
      "sizeBytes",
      "startLine",
      "truncated",
    ]);
  });

  it("should refuse binary content without returning base64", async () => {
    await writeFile(join(workspaceRoot, "binary.bin"), Buffer.from([0, 1, 2]));
    const result = await createReadFileTool().execute(
      { path: "binary.bin" },
      makeCtx(),
    );
    expect(result.error?.kind).toBe("binary_file");
    expect(result.data).toBeUndefined();
  });

  describe("error mapping", () => {
    it("returns not_found for missing files", async () => {
      const tool = createReadFileTool();
      const result = await tool.execute({ path: "nope.txt" }, makeCtx());

      expect(result.ok).toBe(false);
      expect(result.error?.kind).toBe("not_found");
    });

    it("returns not_found with glob hint when path is a directory", async () => {
      const dirPath = "subdir";
      await mkdir(join(workspaceRoot, dirPath));

      const tool = createReadFileTool();
      const result = await tool.execute({ path: dirPath }, makeCtx());

      expect(result.ok).toBe(false);
      expect(result.error?.kind).toBe("not_found");
      expect(result.error?.suggestedNextAction).toContain("glob");
    });

    it("rejects path traversal when outside-workspace access is denied", async () => {
      const tool = createReadFileTool();
      const result = await tool.execute(
        { path: "../../etc/hosts" },
        makeCtx({ outsideWorkspace: "deny" }),
      );

      expect(result.ok).toBe(false);
      expect(result.error?.kind).toBe("outside_workspace");
    });

    it("rejects absolute paths when absolute paths are disabled", async () => {
      const path = join(workspaceRoot, "ok.txt");
      await writeFile(path, "x");

      const tool = createReadFileTool();
      // absolute path → blocked even though it points inside the workspace
      const result = await tool.execute(
        { path },
        makeCtx({ absolutePaths: "deny", outsideWorkspace: "deny" }),
      );

      expect(result.ok).toBe(false);
      expect(result.error?.kind).toBe("outside_workspace");
    });

    it("rejects forbidden globs with permission_denied", async () => {
      const path = "secret.env";
      await writeFile(join(workspaceRoot, path), "TOKEN=1");

      const tool = createReadFileTool();
      const result = await tool.execute(
        { path },
        makeCtx({ forbiddenGlobs: ["**/*.env"] }),
      );

      expect(result.ok).toBe(false);
      expect(result.error?.kind).toBe("permission_denied");
    });

    it("rejects symlinks that escape the workspace with outside_workspace", async () => {
      const linkPath = join(workspaceRoot, "escape.txt");
      const targetOutside = join(outsideRoot, "target.txt");
      await writeFile(targetOutside, "secret");
      await symlink(targetOutside, linkPath);

      const tool = createReadFileTool();
      const result = await tool.execute(
        { path: "escape.txt" },
        makeCtx({ outsideWorkspace: "deny" }),
      );

      expect(result.ok).toBe(false);
      expect(result.error?.kind).toBe("outside_workspace");
    });
  });
});

// Reference vector: known SHA-256 of "abc" = ba7816bf...
describe("createReadFileTool — sha256 reference vector", () => {
  it('hashes "abc" to the FIPS-180 reference value', async () => {
    const base = realpathSync(tmpdir());
    const ws = await mkdtemp(join(base, "read-file-ref-"));
    try {
      const path = "abc.txt";
      await writeFile(join(ws, path), "abc");

      const tool = createReadFileTool();
      const ctx = makeToolContext({
        sandbox: createSandbox({
          cwd: ws,
          outsideWorkspace: "deny",
          absolutePaths: "deny",
          forbiddenGlobs: [],
        }),
      });
      const result = await tool.execute({ path }, ctx);
      expect(result.ok).toBe(true);
      expect(result.data?.sha256).toBe(
        "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
      );
    } finally {
      await rm(ws, { recursive: true, force: true });
    }
  });
});
