// Tests for PID file management — CRUD, liveness checks, edge cases.

import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { isRunning, readPid, removePid, writePid } from "./pid";

// Helpers

/** Generate a unique temp path for a PID file. */
function tmpPidFile(): string {
  return join(tmpdir(), `comma-test-${crypto.randomUUID()}`, "daemon.pid");
}

/** Track temp files for cleanup. */
const tempPaths: string[] = [];

afterEach(() => {
  for (const p of tempPaths) {
    try {
      // Remove file and parent dir
      if (existsSync(p)) {
        const { unlinkSync, rmdirSync } = require("node:fs");
        const { dirname } = require("node:path");
        unlinkSync(p);
        try {
          rmdirSync(dirname(p));
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

// writePid

describe("writePid", () => {
  test("writes current process PID to file", () => {
    const pidFile = tmpPidFile();
    tempPaths.push(pidFile);

    writePid(pidFile);

    const content = readFileSync(pidFile, "utf-8").trim();
    expect(parseInt(content, 10)).toBe(process.pid);
  });

  test("creates parent directories if they don't exist", () => {
    const pidFile = join(
      tmpdir(),
      `comma-test-${crypto.randomUUID()}`,
      "nested",
      "deep",
      "daemon.pid",
    );
    tempPaths.push(pidFile);

    writePid(pidFile);

    expect(existsSync(pidFile)).toBe(true);
    const content = readFileSync(pidFile, "utf-8").trim();
    expect(parseInt(content, 10)).toBe(process.pid);
  });

  test("overwrites existing PID file", () => {
    const pidFile = tmpPidFile();
    tempPaths.push(pidFile);

    // Write once
    writePid(pidFile);
    const first = readFileSync(pidFile, "utf-8").trim();

    // Overwrite with same PID
    writePid(pidFile);
    const second = readFileSync(pidFile, "utf-8").trim();

    expect(first).toBe(second);
  });
});

// readPid

describe("readPid", () => {
  test("returns the PID that was written", () => {
    const pidFile = tmpPidFile();
    tempPaths.push(pidFile);

    writePid(pidFile);
    const pid = readPid(pidFile);

    expect(pid).toBe(process.pid);
  });

  test("returns undefined for nonexistent file", () => {
    const pidFile = join(tmpdir(), `nonexistent-${crypto.randomUUID()}.pid`);
    expect(readPid(pidFile)).toBeUndefined();
  });

  test("returns undefined for non-numeric content", () => {
    const pidFile = tmpPidFile();
    tempPaths.push(pidFile);

    const { dirname: d } = require("node:path");
    mkdirSync(d(pidFile), { recursive: true });
    writeFileSync(pidFile, "not-a-number");

    expect(readPid(pidFile)).toBeUndefined();
  });

  test("returns undefined for empty file", () => {
    const pidFile = tmpPidFile();
    tempPaths.push(pidFile);

    const { dirname: d } = require("node:path");
    mkdirSync(d(pidFile), { recursive: true });
    writeFileSync(pidFile, "");

    expect(readPid(pidFile)).toBeUndefined();
  });

  test("returns undefined for negative PID", () => {
    const pidFile = tmpPidFile();
    tempPaths.push(pidFile);

    const { dirname: d } = require("node:path");
    mkdirSync(d(pidFile), { recursive: true });
    writeFileSync(pidFile, "-1");

    expect(readPid(pidFile)).toBeUndefined();
  });
});

// removePid

describe("removePid", () => {
  test("removes an existing PID file", () => {
    const pidFile = tmpPidFile();
    tempPaths.push(pidFile);

    writePid(pidFile);
    expect(existsSync(pidFile)).toBe(true);

    removePid(pidFile);
    expect(existsSync(pidFile)).toBe(false);
  });

  test("is a no-op for nonexistent file", () => {
    const pidFile = join(tmpdir(), `nonexistent-${crypto.randomUUID()}.pid`);
    // Should not throw
    removePid(pidFile);
  });

  test("is idempotent — removing twice does not throw", () => {
    const pidFile = tmpPidFile();
    tempPaths.push(pidFile);

    writePid(pidFile);
    removePid(pidFile);
    removePid(pidFile); // Second call — should not throw
  });
});

// isRunning

describe("isRunning", () => {
  test("returns true for the current process", () => {
    expect(isRunning(process.pid)).toBe(true);
  });

  test("returns false for a PID that does not exist", () => {
    // Use a very large PID that almost certainly doesn't exist.
    // On most systems, PID_MAX is 32768 or 4194304.
    expect(isRunning(4194300)).toBe(false);
  });

  test("stale PID detection: written PID of dead process", () => {
    const pidFile = tmpPidFile();
    tempPaths.push(pidFile);

    // Write a PID that doesn't correspond to a running process
    const { dirname: d } = require("node:path");
    mkdirSync(d(pidFile), { recursive: true });
    writeFileSync(pidFile, "4194300");

    const pid = readPid(pidFile);
    expect(pid).toBe(4194300);
    expect(isRunning(pid!)).toBe(false);
  });
});
