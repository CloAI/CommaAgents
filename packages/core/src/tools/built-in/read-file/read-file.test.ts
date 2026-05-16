import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { realpathSync } from "node:fs";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { createSandbox } from "../../../sandbox/sandbox";
import { sha256OfBuffer } from "../../io";
import { makeToolContext } from "../../test.utils";
import type { ToolContext } from "../../tool.types";
import { createReadFileTool, type ReadFileData } from "./index";

let workspaceRoot: string;
let outsideRoot: string;

beforeEach(async () => {
  // realpath to dodge macOS /tmp → /private/tmp symlink in jail checks
  const base = realpathSync(tmpdir());
  workspaceRoot = await mkdtemp(join(base, "read-file-ws-"));
  outsideRoot = await mkdtemp(join(base, "read-file-outside-"));
});

afterEach(async () => {
  await rm(workspaceRoot, { recursive: true, force: true });
  await rm(outsideRoot, { recursive: true, force: true });
});

function makeCtx(overrides?: {
  jail?: boolean;
  allowAbsolutePaths?: boolean;
  forbiddenGlobs?: readonly string[];
}): ToolContext {
  return makeToolContext({
    sandbox: createSandbox({
      cwd: workspaceRoot,
      jail: overrides?.jail ?? true,
      allowAbsolutePaths: overrides?.allowAbsolutePaths ?? false,
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
  if (!result.data) throw new Error("expected data");
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

      expect(data.encoding).toBe("utf8");
      expect(data.binary).toBe(false);
      expect(data.content).toBe(text);
      expect(data.sha256).toBe(sha256OfBuffer(text));
      expect(data.sizeBytes).toBe(Buffer.byteLength(text, "utf8"));
      // "a\nb\nc\n".split("\n") yields ["a","b","c",""] → lineCount 4
      expect(data.lineCount).toBe(4);
      expect(data.startLine).toBe(1);
      expect(data.endLine).toBe(4);
      expect(data.truncated).toBe(false);
      expect(data.hasBom).toBe(false);
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

    it("truncates content when slice exceeds maxBytes", async () => {
      const path = "big.txt";
      const text = "x".repeat(10_000);
      await writeFile(join(workspaceRoot, path), text);

      const tool = createReadFileTool();
      const data = await getOk(
        await tool.execute({ path, maxBytes: 100 }, makeCtx()),
      );

      expect(data.truncated).toBe(true);
      expect(Buffer.byteLength(data.content!, "utf8")).toBeLessThanOrEqual(100);
      // Still hashes the full file
      expect(data.sha256).toBe(sha256OfBuffer(text));
      expect(data.sizeBytes).toBe(10_000);
    });
  });

  describe("newline detection", () => {
    it.each<["lf" | "crlf" | "mixed" | "none", string]>([
      ["lf", "a\nb\nc\n"],
      ["crlf", "a\r\nb\r\nc\r\n"],
      ["mixed", "a\nb\r\nc"],
      ["none", "single-line"],
    ])("reports newlineStyle=%s", async (style, text) => {
      const path = `newline-${style}.txt`;
      await writeFile(join(workspaceRoot, path), text);

      const tool = createReadFileTool();
      const data = await getOk(await tool.execute({ path }, makeCtx()));
      expect(data.newlineStyle).toBe(style);
    });
  });

  describe("BOM", () => {
    it("strips BOM from content but reports hasBom=true", async () => {
      const path = "bom.txt";
      const text = "\uFEFFhello";
      await writeFile(join(workspaceRoot, path), text);

      const tool = createReadFileTool();
      const data = await getOk(await tool.execute({ path }, makeCtx()));

      expect(data.hasBom).toBe(true);
      expect(data.content).toBe("hello");
    });
  });

  describe("binary policy", () => {
    it("returns binary_file error with size+sha256 and no content on first call", async () => {
      const path = "image.bin";
      const buf = Buffer.from([0x89, 0x50, 0x4e, 0x00, 0x01, 0x02, 0x03]);
      await writeFile(join(workspaceRoot, path), buf);

      const tool = createReadFileTool();
      const result = await tool.execute({ path }, makeCtx());

      expect(result.ok).toBe(false);
      expect(result.error?.kind).toBe("binary_file");
      expect(result.error?.recoverable).toBe(true);
      expect(result.error?.suggestedNextAction).toContain("allowBinary");
      expect(result.data?.binary).toBe(true);
      expect(result.data?.sizeBytes).toBe(buf.byteLength);
      expect(result.data?.sha256).toBe(sha256OfBuffer(buf));
      expect(result.data?.content).toBeUndefined();
      expect(result.data?.contentBase64).toBeUndefined();
    });

    it("returns base64 content when allowBinary is true", async () => {
      const path = "image.bin";
      const buf = Buffer.from([0x89, 0x50, 0x4e, 0x00, 0x01, 0x02, 0x03]);
      await writeFile(join(workspaceRoot, path), buf);

      const tool = createReadFileTool();
      const data = await getOk(
        await tool.execute({ path, allowBinary: true }, makeCtx()),
      );

      expect(data.binary).toBe(true);
      expect(data.encoding).toBe("base64");
      expect(data.contentBase64).toBe(buf.toString("base64"));
      expect(data.content).toBeUndefined();
      expect(data.sha256).toBe(sha256OfBuffer(buf));
    });
  });

  describe("error mapping", () => {
    it("returns not_found for missing files", async () => {
      const tool = createReadFileTool();
      const result = await tool.execute({ path: "nope.txt" }, makeCtx());

      expect(result.ok).toBe(false);
      expect(result.error?.kind).toBe("not_found");
    });

    it("returns not_found with list_directory hint when path is a directory", async () => {
      const dirPath = "subdir";
      await mkdir(join(workspaceRoot, dirPath));

      const tool = createReadFileTool();
      const result = await tool.execute({ path: dirPath }, makeCtx());

      expect(result.ok).toBe(false);
      expect(result.error?.kind).toBe("not_found");
      expect(result.error?.suggestedNextAction).toContain("list_directory");
    });

    it("rejects path traversal with outside_workspace when jail is on", async () => {
      const tool = createReadFileTool();
      const result = await tool.execute(
        { path: "../../etc/hosts" },
        makeCtx({ jail: true }),
      );

      expect(result.ok).toBe(false);
      expect(result.error?.kind).toBe("outside_workspace");
    });

    it("rejects absolute paths when allowAbsolutePaths is false", async () => {
      const path = join(workspaceRoot, "ok.txt");
      await writeFile(path, "x");

      const tool = createReadFileTool();
      // absolute path → blocked even though it points inside the workspace
      const result = await tool.execute(
        { path },
        makeCtx({ allowAbsolutePaths: false, jail: true }),
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
        makeCtx({ jail: true }),
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
          jail: true,
          allowAbsolutePaths: false,
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

// Silence unused-import warnings when no symlink test runs in this file
void dirname;
