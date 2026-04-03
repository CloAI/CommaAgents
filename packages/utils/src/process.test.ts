// Tests for process utilities — PID file management and liveness checks.

import { afterEach, describe, expect, it } from "bun:test";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { isRunning, readPid, removePid, writePid } from "./process";

/** Generate a unique temp path for a PID file. */
function tmpPidFile(): string {
  return join(tmpdir(), `utils-test-${crypto.randomUUID()}`, "daemon.pid");
}

/** Track temp files for cleanup. */
const tempPaths: string[] = [];

afterEach(() => {
  for (const tempPath of tempPaths) {
    try {
      if (existsSync(tempPath)) {
        const { unlinkSync, rmdirSync } = require("node:fs");
        unlinkSync(tempPath);
        try {
          rmdirSync(dirname(tempPath));
        } catch {
          // Ignore — dir may not be empty or may not exist
        }
      }
    } catch {
      // Ignore cleanup errors
    }
  }
  tempPaths.length = 0;
});

describe("writePid", () => {
  it("should write current process PID to file", () => {
    const pidFile = tmpPidFile();
    tempPaths.push(pidFile);

    writePid(pidFile);

    const content = readFileSync(pidFile, "utf-8").trim();
    expect(parseInt(content, 10)).toBe(process.pid);
  });

  it("should create parent directories if they don't exist", () => {
    const pidFile = join(
      tmpdir(),
      `utils-test-${crypto.randomUUID()}`,
      "nested",
      "deep",
      "daemon.pid",
    );
    tempPaths.push(pidFile);

    writePid(pidFile);

    expect(existsSync(pidFile)).toBe(true);
  });

  it("should overwrite existing PID file", () => {
    const pidFile = tmpPidFile();
    tempPaths.push(pidFile);

    writePid(pidFile);
    writePid(pidFile);

    const content = readFileSync(pidFile, "utf-8").trim();
    expect(parseInt(content, 10)).toBe(process.pid);
  });
});

describe("readPid", () => {
  it("should return the PID that was written", () => {
    const pidFile = tmpPidFile();
    tempPaths.push(pidFile);

    writePid(pidFile);
    expect(readPid(pidFile)).toBe(process.pid);
  });

  it("should return undefined for nonexistent file", () => {
    const pidFile = join(tmpdir(), `nonexistent-${crypto.randomUUID()}.pid`);
    expect(readPid(pidFile)).toBeUndefined();
  });

  it("should return undefined for non-numeric content", () => {
    const pidFile = tmpPidFile();
    tempPaths.push(pidFile);

    mkdirSync(dirname(pidFile), { recursive: true });
    writeFileSync(pidFile, "not-a-number");

    expect(readPid(pidFile)).toBeUndefined();
  });

  it("should return undefined for empty file", () => {
    const pidFile = tmpPidFile();
    tempPaths.push(pidFile);

    mkdirSync(dirname(pidFile), { recursive: true });
    writeFileSync(pidFile, "");

    expect(readPid(pidFile)).toBeUndefined();
  });

  it("should return undefined for negative PID", () => {
    const pidFile = tmpPidFile();
    tempPaths.push(pidFile);

    mkdirSync(dirname(pidFile), { recursive: true });
    writeFileSync(pidFile, "-1");

    expect(readPid(pidFile)).toBeUndefined();
  });
});

describe("removePid", () => {
  it("should remove an existing PID file", () => {
    const pidFile = tmpPidFile();
    tempPaths.push(pidFile);

    writePid(pidFile);
    expect(existsSync(pidFile)).toBe(true);

    removePid(pidFile);
    expect(existsSync(pidFile)).toBe(false);
  });

  it("should be a no-op for nonexistent file", () => {
    const pidFile = join(tmpdir(), `nonexistent-${crypto.randomUUID()}.pid`);
    removePid(pidFile); // Should not throw
  });

  it("should be idempotent", () => {
    const pidFile = tmpPidFile();
    tempPaths.push(pidFile);

    writePid(pidFile);
    removePid(pidFile);
    removePid(pidFile); // Second call — should not throw
  });
});

describe("isRunning", () => {
  it("should return true for the current process", () => {
    expect(isRunning(process.pid)).toBe(true);
  });

  it("should return false for a PID that does not exist", () => {
    expect(isRunning(4194300)).toBe(false);
  });
});
