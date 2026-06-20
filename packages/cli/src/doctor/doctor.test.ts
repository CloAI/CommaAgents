import { afterEach, describe, expect, it } from "bun:test";
import { mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runDoctor } from "./doctor";

const tempDirs: string[] = [];

function createTempDir(): string {
  const tempDir = join(tmpdir(), `comma-doctor-${crypto.randomUUID()}`);
  mkdirSync(tempDir, { recursive: true });
  tempDirs.push(tempDir);
  return tempDir;
}

afterEach(() => {
  for (const tempDir of tempDirs.splice(0)) {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

describe("runDoctor", () => {
  it("should report writable data dir and provider warning for a fresh install", () => {
    const tempDir = createTempDir();
    const result = runDoctor({
      dataDir: tempDir,
      pathValue: process.env.PATH,
    });

    expect(result.status).not.toBe("fail");
    expect(result.checks).toContainEqual(
      expect.objectContaining({
        id: "data-dir",
        status: "pass",
      }),
    );
    expect(result.checks).toContainEqual(
      expect.objectContaining({
        id: "providers",
        status: "warn",
      }),
    );
  });
});
