import { afterEach, describe, expect, it } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getDaemonProcessStatus } from "./process";
import {
  buildDaemonProcessEnvOverrides,
  buildDaemonProcessForegroundArgs,
} from "./process.utils";

const tempDirs: string[] = [];

function createTempDir(): string {
  const tempDir = join(tmpdir(), `comma-daemon-process-${crypto.randomUUID()}`);
  mkdirSync(tempDir, { recursive: true });
  tempDirs.push(tempDir);
  return tempDir;
}

function createEnv(tempDir: string): Record<string, string | undefined> {
  return {
    COMMA_DAEMON_CONFIG_FILE: join(tempDir, "daemon.json"),
    COMMA_DAEMON_PID_FILE: join(tempDir, "daemon.pid"),
    COMMA_DAEMON_RUNS_DIR: join(tempDir, "runs"),
  };
}

afterEach(() => {
  for (const tempDir of tempDirs.splice(0)) {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

describe("getDaemonProcessStatus", () => {
  it("reports stopped when no pid file exists", () => {
    const tempDir = createTempDir();
    const status = getDaemonProcessStatus({ env: createEnv(tempDir) });

    expect(status.state).toBe("stopped");
    expect(status.running).toBe(false);
    expect(status.pid).toBeUndefined();
    expect(status.pidFile).toBe(join(tempDir, "daemon.pid"));
  });

  it("removes stale pid files", () => {
    const tempDir = createTempDir();
    const pidFile = join(tempDir, "daemon.pid");
    writeFileSync(pidFile, "999999999");

    const status = getDaemonProcessStatus({ env: createEnv(tempDir) });

    expect(status.state).toBe("stopped");
    expect(status.running).toBe(false);
    expect(status.pid).toBeUndefined();
  });

  it("reports running when pid file points at this process", () => {
    const tempDir = createTempDir();
    writeFileSync(join(tempDir, "daemon.pid"), String(process.pid));

    const status = getDaemonProcessStatus({ env: createEnv(tempDir) });

    expect(status.state).toBe("running");
    expect(status.running).toBe(true);
    expect(status.pid).toBe(process.pid);
  });
});

describe("daemon process utils", () => {
  it("builds env overrides for port and verbose mode", () => {
    const env = buildDaemonProcessEnvOverrides({
      env: { EXISTING_VALUE: "kept" },
      port: 9100,
      verbose: true,
    });

    expect(env.EXISTING_VALUE).toBe("kept");
    expect(env.COMMA_DAEMON_PORT).toBe("9100");
    expect(env.COMMA_DAEMON_LOG_LEVEL).toBe("debug");
  });

  it("builds foreground args from a command prefix", () => {
    const args = buildDaemonProcessForegroundArgs({
      foregroundCommand: ["comma", "daemon"],
      port: 9100,
      verbose: true,
    });

    expect(args).toEqual([
      "comma",
      "daemon",
      "start",
      "--foreground",
      "--port",
      "9100",
      "--verbose",
    ]);
  });
});
