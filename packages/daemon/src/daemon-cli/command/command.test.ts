import { afterEach, describe, expect, it, spyOn } from "bun:test";
import { mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import yargs from "yargs";
import { daemonStartOptions, runDaemonCommand } from "./command";

const originalEnv = { ...process.env };
const tempDirs: string[] = [];

function createTempDir(): string {
  const tempDir = join(tmpdir(), `comma-daemon-command-${crypto.randomUUID()}`);
  mkdirSync(tempDir, { recursive: true });
  tempDirs.push(tempDir);
  return tempDir;
}

function setDaemonEnv(tempDir: string): void {
  process.env.COMMA_DAEMON_CONFIG_FILE = join(tempDir, "daemon.json");
  process.env.COMMA_DAEMON_PID_FILE = join(tempDir, "daemon.pid");
  process.env.COMMA_DAEMON_RUNS_DIR = join(tempDir, "runs");
  process.env.COMMA_DAEMON_LOG_FILE = join(tempDir, "daemon.log");
}

afterEach(() => {
  for (const key of Object.keys(process.env)) {
    if (!(key in originalEnv)) {
      delete process.env[key];
    }
  }
  Object.assign(process.env, originalEnv);

  for (const tempDir of tempDirs.splice(0)) {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

describe("runDaemonCommand", () => {
  it("should parse logging flags without inventing defaults for absent flags", async () => {
    const omitted = await daemonStartOptions(yargs([])).parseAsync();
    expect(omitted.console).toBeUndefined();
    expect(omitted.consoleFormat).toBeUndefined();
    expect(omitted.logPayloads).toBeUndefined();
    const parsed = await daemonStartOptions(
      yargs([
        "--foreground",
        "--no-console",
        "--console-format",
        "json",
        "--log-payloads",
      ]),
    ).parseAsync();
    expect(parsed).toMatchObject({
      foreground: true,
      console: false,
      consoleFormat: "json",
      logPayloads: true,
    });
    const disabled = await daemonStartOptions(
      yargs(["--no-log-payloads"]),
    ).parseAsync();
    expect(disabled.logPayloads).toBe(false);
  });
  it("prints text daemon status", async () => {
    const tempDir = createTempDir();
    setDaemonEnv(tempDir);
    const consoleLog = spyOn(console, "log").mockImplementation(() => {});

    await runDaemonCommand("status", {});

    expect(consoleLog).toHaveBeenCalledWith("Daemon is not running");
    consoleLog.mockRestore();
  });

  it("prints json daemon status", async () => {
    const tempDir = createTempDir();
    setDaemonEnv(tempDir);
    const consoleLog = spyOn(console, "log").mockImplementation(() => {});

    await runDaemonCommand("status", { json: true });

    const [jsonOutput] = consoleLog.mock.calls[0] ?? [];
    expect(JSON.parse(String(jsonOutput))).toMatchObject({
      state: "stopped",
      running: false,
      pidFile: join(tempDir, "daemon.pid"),
    });
    consoleLog.mockRestore();
  });

  it("prints configured log file path", async () => {
    const tempDir = createTempDir();
    setDaemonEnv(tempDir);
    const consoleLog = spyOn(console, "log").mockImplementation(() => {});

    await runDaemonCommand("logs", {});

    expect(consoleLog).toHaveBeenCalledWith(join(tempDir, "daemon.log"));
    consoleLog.mockRestore();
  });
});
