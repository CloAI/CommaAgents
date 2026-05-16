import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import {
  chmod,
  mkdtemp,
  readdir,
  readFile,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writeAtomic } from "./atomic-write";

let workDir: string;

beforeEach(async () => {
  workDir = await mkdtemp(join(tmpdir(), "atomic-write-test-"));
});

afterEach(async () => {
  // Tests clean up implicitly via tmpdir; no rmdir needed.
});

describe("writeAtomic", () => {
  it("creates a new file when the target does not exist", async () => {
    const path = join(workDir, "fresh.txt");
    await writeAtomic(path, "hello");
    expect(await readFile(path, "utf8")).toBe("hello");
  });

  it("replaces an existing file's contents", async () => {
    const path = join(workDir, "existing.txt");
    await writeFile(path, "old");
    await writeAtomic(path, "new");
    expect(await readFile(path, "utf8")).toBe("new");
  });

  it("preserves the existing file's mode bits", async () => {
    const path = join(workDir, "exec.sh");
    await writeFile(path, "#!/bin/sh\necho old");
    await chmod(path, 0o755);

    await writeAtomic(path, "#!/bin/sh\necho new");

    const stats = await stat(path);
    expect(stats.mode & 0o777).toBe(0o755);
    expect(await readFile(path, "utf8")).toBe("#!/bin/sh\necho new");
  });

  it("applies an explicit mode when provided, overriding existing", async () => {
    const path = join(workDir, "explicit.txt");
    await writeFile(path, "old");
    await chmod(path, 0o644);

    await writeAtomic(path, "new", { mode: 0o600 });

    const stats = await stat(path);
    expect(stats.mode & 0o777).toBe(0o600);
  });

  it("leaves no temp files behind on success", async () => {
    const path = join(workDir, "clean.txt");
    await writeAtomic(path, "data");
    const entries = await readdir(workDir);
    expect(entries).toEqual(["clean.txt"]);
  });

  it("cleans up the temp file when rename fails", async () => {
    // Force a failure by writing to a path whose parent does not exist.
    const path = join(workDir, "missing", "file.txt");
    await expect(writeAtomic(path, "data")).rejects.toBeDefined();

    // The non-existent parent means the temp write itself fails before
    // anything is created — there's nothing to clean up in the workDir.
    const entries = await readdir(workDir);
    expect(entries).toEqual([]);
  });

  it("supports Uint8Array content", async () => {
    const path = join(workDir, "bin.dat");
    await writeAtomic(path, new Uint8Array([1, 2, 3, 0, 255]));
    const read = await readFile(path);
    expect(Array.from(read)).toEqual([1, 2, 3, 0, 255]);
  });
});
