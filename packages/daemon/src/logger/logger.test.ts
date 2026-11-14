import { spawn } from "node:child_process";
import { once } from "node:events";
import { afterEach, describe, expect, test } from "vitest";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  getLogger,
  resetSync,
  withConfig,
  type LogRecord,
} from "@logtape/logtape";
import { initializeLogging } from "./";

// Obtain the instance before initialization, as application modules do.
const logger = getLogger(["comma", "daemon", "test"]);
const directories: string[] = [];
function logFile(): string {
  const directory = mkdtempSync(join(tmpdir(), "comma-logtape-"));
  directories.push(directory);
  return join(directory, "nested", "daemon.log");
}
function readRecords(file: string): Record<string, unknown>[] {
  return readFileSync(file, "utf8")
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}
afterEach(() => {
  resetSync();
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("application logging", () => {
  test("should select console format independently of JSON file output and disable console output", async () => {
    for (const consoleFormat of ["text", "json"] as const) {
      for (const stderrEnabled of [true, false]) {
        const file = logFile();
        const script = `
          import { initializeLogging } from ${JSON.stringify(new URL("./index.ts", import.meta.url).pathname)};
          import { getLogger } from "@logtape/logtape";
          const logging = initializeLogging(${JSON.stringify({ file, consoleFormat, stderr: stderrEnabled, level: "debug" })});
          getLogger(["comma", "test"]).debug("Tool completed", { toolCallId: "tool-1", durationMs: 12 });
          logging.close();
        `;
        const child = spawn(
          process.execPath,
          ["--import", "tsx", "--input-type=module", "--eval", script],
          {
            stdio: "pipe",
            cwd: new URL("../../", import.meta.url).pathname,
          },
        );
        const [code, stdout, stderr] = await Promise.all([
          once(child, "exit").then(([code]) => code),
          Array.fromAsync(child.stdout!).then((chunks) =>
            Buffer.concat(chunks).toString(),
          ),
          Array.fromAsync(child.stderr!).then((chunks) =>
            Buffer.concat(chunks).toString(),
          ),
        ]);
        expect(code).toBe(0);
        expect(stdout).toBe("");
        if (!stderrEnabled) {
          expect(stderr).toBe("");
        } else if (consoleFormat === "json") {
          expect(JSON.parse(stderr)).toMatchObject({
            message: "Tool completed",
            properties: { toolCallId: "tool-1" },
          });
        } else {
          expect(stderr).toContain("Tool completed");
          expect(stderr).toContain("tool-1");
          expect(stderr).toContain("12");
          expect(stderr.trim().startsWith("{")).toBe(false);
        }
        expect(readRecords(file)).toMatchObject([
          {
            level: "DEBUG",
            message: "Tool completed",
            properties: { toolCallId: "tool-1", durationMs: 12 },
          },
        ]);
      }
    }
  });
  test("package imports are silent and foreground diagnostics go only to stderr", async () => {
    const script = `
      import { initializeLogging } from ${JSON.stringify(new URL("./index.ts", import.meta.url).pathname)};
      import { getLogger } from "@logtape/logtape";
      const logger = getLogger(["comma", "smoke"]);
      logger.error("before configuration");
      const logging = initializeLogging({ level: "trace" });
      for (const level of ["trace", "debug", "info", "warning", "error", "fatal"]) logger[level](level);
      logging.close();
    `;
    const child = spawn(
      process.execPath,
      ["--import", "tsx", "--input-type=module", "--eval", script],
      {
        stdio: "pipe",
        cwd: new URL("../../", import.meta.url).pathname,
      },
    );
    const [stdout, stderr, code] = await Promise.all([
      Array.fromAsync(child.stdout!).then((chunks) =>
        Buffer.concat(chunks).toString(),
      ),
      Array.fromAsync(child.stderr!).then((chunks) =>
        Buffer.concat(chunks).toString(),
      ),
      once(child, "exit").then(([code]) => code),
    ]);
    expect(code).toBe(0);
    expect(stdout).toBe("");
    expect(
      stderr
        .trim()
        .split("\n")
        .map((line) => JSON.parse(line).message),
    ).toEqual(["trace", "debug", "info", "warning", "error", "fatal"]);
  });

  test("retains file diagnostics when background process stdio is ignored", async () => {
    const file = logFile();
    const script = `
      import { initializeLogging } from ${JSON.stringify(new URL("./index.ts", import.meta.url).pathname)};
      import { getLogger } from "@logtape/logtape";
      const logging = initializeLogging({ file: ${JSON.stringify(file)} });
      getLogger(["comma", "smoke"]).info("background diagnostic");
      logging.close();
    `;
    const child = spawn(
      process.execPath,
      ["--import", "tsx", "--input-type=module", "--eval", script],
      {
        stdio: ["ignore", "ignore", "ignore"],
        cwd: new URL("../../", import.meta.url).pathname,
      },
    );
    expect(await once(child, "exit").then(([code]) => code)).toBe(0);
    expect(readRecords(file)).toMatchObject([
      { message: "background diagnostic" },
    ]);
  });

  test("early logger handles use the global policy, protect fields, and flush on close", () => {
    const file = logFile();
    const logging = initializeLogging({ file, stderr: false });
    logger.debug("filtered");
    logger.info("hello", { level: "forged", message: "metadata", value: 42 });
    getLogger(["comma", "other-package"]).info("shared policy");
    logging.close();
    logging.close();
    expect(readRecords(file)).toMatchObject([
      {
        level: "INFO",
        message: "hello",
        logger: "comma.daemon.test",
        properties: { level: "forged", message: "metadata", value: 42 },
      },
      { message: "shared policy", logger: "comma.other-package" },
    ]);
  });

  test("appends across restarts and accepts legacy warn configuration", () => {
    const file = logFile();
    let logging = initializeLogging({ file, stderr: false });
    logger.info("first startup");
    logging.close();
    logging = initializeLogging({ file, stderr: false, level: "warn" });
    logger.info("filtered");
    logger.warning("second startup");
    logging.close();
    expect(readRecords(file).map((entry) => entry.message)).toEqual([
      "first startup",
      "second startup",
    ]);
  });

  test("rotates files and bounds the number of backups", () => {
    const file = logFile();
    const logging = initializeLogging({
      file,
      stderr: false,
      maxSize: 256,
      maxFiles: 2,
    });
    // Cross the package's write buffer repeatedly as well as the rotation threshold.
    for (let i = 0; i < 100; i++) {
      logger.info("entry {i}: {payload}", { i, payload: "x".repeat(200) });
    }
    logging.close();
    expect(readdirSync(join(file, "..")).sort()).toEqual([
      "daemon.log",
      "daemon.log.1",
      "daemon.log.2",
    ]);
    expect(readRecords(file).at(-1)?.properties).toMatchObject({ i: 99 });
  });

  test("refuses to replace an existing application configuration", () => {
    const file = logFile();
    const logging = initializeLogging({ file, stderr: false });
    expect(() => initializeLogging({ file, stderr: false })).toThrow(
      "already configured",
    );
    logger.info("still active");
    logging.close();
    expect(readRecords(file)).toHaveLength(1);
  });

  test("a stale owner cannot close a later application configuration", () => {
    const first = initializeLogging({ stderr: false });
    resetSync();
    const file = logFile();
    const second = initializeLogging({ file, stderr: false });
    first.close();
    logger.info("second owner");
    second.close();
    expect(readRecords(file)).toHaveLength(1);
  });

  test("concurrent scopes capture module loggers without injection or cross-talk", async () => {
    const logging = initializeLogging({ stderr: false });
    async function capture(message: string): Promise<LogRecord[]> {
      const records: LogRecord[] = [];
      await withConfig(
        {
          sinks: {
            capture: (record) => {
              records.push(record);
            },
          },
          loggers: [
            { category: ["comma"], lowestLevel: "debug", sinks: ["capture"] },
          ],
        },
        async () => {
          await new Promise((resolve) => setTimeout(resolve, 5));
          logger.debug(message);
        },
      );
      return records;
    }
    const [first, second] = await Promise.all([
      capture("first"),
      capture("second"),
    ]);
    expect(first.map((record) => record.rawMessage)).toEqual(["first"]);
    expect(second.map((record) => record.rawMessage)).toEqual(["second"]);
    logging.close();
  });

  test("rejects invalid rotation settings before creating a file", () => {
    expect(() => initializeLogging({ maxSize: 0 })).toThrow("maxSize");
    expect(() => initializeLogging({ maxFiles: -1 })).toThrow("maxFiles");
  });
});
