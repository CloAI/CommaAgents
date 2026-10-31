import { afterEach, describe, expect, it } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  getDaemonProcessStatus,
  startDaemonProcess,
  stopDaemonProcess,
} from ".";
import { resetDaemonDefaultOverrides } from "../../defaults";
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

describe("daemon kernel process startup", () => {
  it("should wait for the launched process to publish its own PID", async () => {
    const directory = createTempDir();
    const pidFile = join(directory, "daemon.pid");
    const env = { ...process.env, ...createEnv(directory) };
    const script = `
      import { writeFileSync } from "node:fs";
      setTimeout(() => writeFileSync(${JSON.stringify(pidFile)}, String(process.pid)), 50);
      setInterval(() => {}, 1000);
    `;
    try {
      const started = await startDaemonProcess({
        env,
        foregroundCommand: [process.execPath, "--eval", script, "--"],
        readinessTimeoutMs: 2000,
      });
      expect(started.status.running).toBe(true);
      expect(started.message).toContain("Daemon started in background");
    } finally {
      await stopDaemonProcess({ env });
      resetDaemonDefaultOverrides();
    }
  });

  it("should keep waiting when the PID file belongs to a different live process", async () => {
    const directory = createTempDir();
    const pidFile = join(directory, "daemon.pid");
    const childPidFile = join(directory, "child.pid");
    const env = { ...process.env, ...createEnv(directory) };
    const script = `
      import { writeFileSync } from "node:fs";
      writeFileSync(${JSON.stringify(childPidFile)}, String(process.pid));
      writeFileSync(${JSON.stringify(pidFile)}, String(process.ppid));
      setInterval(() => {}, 1000);
    `;
    try {
      const started = await startDaemonProcess({
        env,
        foregroundCommand: [process.execPath, "--eval", script, "--"],
        readinessTimeoutMs: 500,
      });
      expect(started.message).toBe("Daemon may still be starting");
    } finally {
      const childPid = Number(await Bun.file(childPidFile).text());
      process.kill(childPid, "SIGTERM");
      rmSync(pidFile, { force: true });
      resetDaemonDefaultOverrides();
    }
  });

  it("should report startup failure when the launched process exits early", async () => {
    const directory = createTempDir();
    try {
      await expect(
        startDaemonProcess({
          env: {
            ...process.env,
            ...createEnv(directory),
            COMMA_DAEMON_LOG_FILE: join(directory, "daemon.log"),
          },
          foregroundCommand: [process.execPath, "--eval", "process.exit(7)"],
          readinessTimeoutMs: 2000,
        }),
      ).rejects.toThrow("Daemon process exited before startup completed");
    } finally {
      resetDaemonDefaultOverrides();
    }
  });

  it("should start the real CLI in the background with the supplied environment and release its PID on stop", async () => {
    const directory = createTempDir();
    const reservation = Bun.serve({
      port: 0,
      hostname: "127.0.0.1",
      fetch() {
        return new Response();
      },
    });
    const port = reservation.port!;
    await reservation.stop(true);
    const env = {
      ...process.env,
      ...createEnv(directory),
      COMMA_AGENTS_DATA_DIRECTORY: join(directory, "data"),
      COMMA_DAEMON_HOST: "127.0.0.1",
      COMMA_DAEMON_PORT: String(port),
      COMMA_DAEMON_LOG_FILE: join(directory, "daemon.log"),
    };
    try {
      const started = await startDaemonProcess({
        env,
        readinessTimeoutMs: 5000,
      });
      expect(started.started).toBe(true);
      expect(started.status).toMatchObject({
        running: true,
        port,
        pidFile: join(directory, "daemon.pid"),
      });
      expect(started.message).toContain("Daemon started in background");
      expect((await stopDaemonProcess({ env })).stopped).toBe(true);
      expect(await Bun.file(join(directory, "daemon.log")).text()).toContain(
        "Daemon listening at ws://127.0.0.1:",
      );
      expect(await Bun.file(join(directory, "daemon.pid")).exists()).toBe(
        false,
      );
    } finally {
      await stopDaemonProcess({ env });
      resetDaemonDefaultOverrides();
    }
  }, 15000);
});
