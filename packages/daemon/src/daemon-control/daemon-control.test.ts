import { afterEach, describe, expect, it } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getDaemonStatus } from "./daemon-control";

const tempDirs: string[] = [];

function createTempDir(): string {
  const tempDir = join(tmpdir(), `comma-daemon-control-${crypto.randomUUID()}`);
  mkdirSync(tempDir, { recursive: true });
  tempDirs.push(tempDir);
  return tempDir;
}

function createEnv(tempDir: string): Record<string, string | undefined> {
  return {
    COMMA_DAEMON_CONFIG_FILE: join(tempDir, "daemon.json"),
    COMMA_DAEMON_PID_FILE: join(tempDir, "daemon.pid"),
    COMMA_DAEMON_RUNS_DIR: join(tempDir, "runs"),
    COMMA_DAEMON_PROVIDER_CACHE_DIR: join(tempDir, "providers"),
  };
}

afterEach(() => {
  for (const tempDir of tempDirs.splice(0)) {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

describe("getDaemonStatus", () => {
  it("should report stopped when no pid file exists", () => {
    const tempDir = createTempDir();
    const status = getDaemonStatus({ env: createEnv(tempDir) });

    expect(status.state).toBe("stopped");
    expect(status.running).toBe(false);
    expect(status.pid).toBeUndefined();
    expect(status.pidFile).toBe(join(tempDir, "daemon.pid"));
  });

  it("should remove stale pid files", () => {
    const tempDir = createTempDir();
    const pidFile = join(tempDir, "daemon.pid");
    writeFileSync(pidFile, "999999999");

    const status = getDaemonStatus({ env: createEnv(tempDir) });

    expect(status.state).toBe("stopped");
    expect(status.running).toBe(false);
    expect(status.pid).toBeUndefined();
  });

  it("should report running when pid file points at this process", () => {
    const tempDir = createTempDir();
    writeFileSync(join(tempDir, "daemon.pid"), String(process.pid));

    const status = getDaemonStatus({ env: createEnv(tempDir) });

    expect(status.state).toBe("running");
    expect(status.running).toBe(true);
    expect(status.pid).toBe(process.pid);
  });
});
