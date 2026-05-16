// Tests for the daemon logger.

import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createLogger } from "./logger";
import type { LogEntry, LogSink } from "./logger.types";
import { LOG_LEVELS } from "./logger.types";
import { createFileSink } from "./sinks/file";
import { createStderrSink, formatJsonLine } from "./sinks/stderr";
import { createSystemSink, describeSystemLogging } from "./sinks/system";

// Helpers

/** A test sink that captures entries in an array. */
function createCaptureSink(): LogSink & { entries: LogEntry[] } {
  const entries: LogEntry[] = [];
  return {
    entries,
    write(entry: LogEntry) {
      entries.push(entry);
    },
    flush() {},
    close() {},
  };
}

/** Create a unique temp dir for file sink tests. */
function createTempDir(): string {
  const dir = join(
    tmpdir(),
    `comma-logger-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
  mkdirSync(dir, { recursive: true });
  return dir;
}

// LOG_LEVELS

describe("LOG_LEVELS", () => {
  test("debug < info < warn < error", () => {
    expect(LOG_LEVELS.debug).toBeLessThan(LOG_LEVELS.info);
    expect(LOG_LEVELS.info).toBeLessThan(LOG_LEVELS.warn);
    expect(LOG_LEVELS.warn).toBeLessThan(LOG_LEVELS.error);
  });
});

// formatJsonLine

describe("formatJsonLine", () => {
  test("formats basic entry", () => {
    const entry: LogEntry = {
      ts: "2026-03-01T12:00:00.000Z",
      level: "info",
      msg: "hello",
    };
    const line = formatJsonLine(entry);
    const parsed = JSON.parse(line);
    expect(parsed).toEqual({
      ts: "2026-03-01T12:00:00.000Z",
      level: "info",
      msg: "hello",
    });
  });

  test("includes component when present", () => {
    const entry: LogEntry = {
      ts: "2026-03-01T12:00:00.000Z",
      level: "info",
      msg: "hi",
      component: "ws",
    };
    const parsed = JSON.parse(formatJsonLine(entry));
    expect(parsed.component).toBe("ws");
  });

  test("spreads meta fields at top level", () => {
    const entry: LogEntry = {
      ts: "2026-03-01T12:00:00.000Z",
      level: "info",
      msg: "started",
      meta: { port: 7422, host: "localhost" },
    };
    const parsed = JSON.parse(formatJsonLine(entry));
    expect(parsed.port).toBe(7422);
    expect(parsed.host).toBe("localhost");
    // meta should not appear as a nested key
    expect(parsed.meta).toBeUndefined();
  });

  test("omits empty meta", () => {
    const entry: LogEntry = {
      ts: "2026-03-01T12:00:00.000Z",
      level: "debug",
      msg: "x",
      meta: {},
    };
    const line = formatJsonLine(entry);
    expect(line).not.toContain("meta");
  });

  test("produces valid single-line JSON", () => {
    const entry: LogEntry = {
      ts: "2026-03-01T12:00:00.000Z",
      level: "error",
      msg: "multi\nline\nmessage",
      meta: { stack: "line1\nline2" },
    };
    const line = formatJsonLine(entry);
    expect(line.includes("\n")).toBe(false); // single line
    expect(() => JSON.parse(line)).not.toThrow();
  });
});

// createLogger — level filtering

describe("createLogger level filtering", () => {
  test("default level is info — filters out debug", () => {
    const sink = createCaptureSink();
    const log = createLogger({ sinks: [sink] });

    log.debug("should be dropped");
    log.info("should appear");
    log.warn("should appear");
    log.error("should appear");

    expect(sink.entries).toHaveLength(3);
    expect(sink.entries.map((e) => e.level)).toEqual(["info", "warn", "error"]);
  });

  test("level debug — includes everything", () => {
    const sink = createCaptureSink();
    const log = createLogger({ level: "debug", sinks: [sink] });

    log.debug("d");
    log.info("i");
    log.warn("w");
    log.error("e");

    expect(sink.entries).toHaveLength(4);
  });

  test("level warn — filters out debug and info", () => {
    const sink = createCaptureSink();
    const log = createLogger({ level: "warn", sinks: [sink] });

    log.debug("dropped");
    log.info("dropped");
    log.warn("kept");
    log.error("kept");

    expect(sink.entries).toHaveLength(2);
    expect(sink.entries.map((e) => e.level)).toEqual(["warn", "error"]);
  });

  test("level error — only error passes", () => {
    const sink = createCaptureSink();
    const log = createLogger({ level: "error", sinks: [sink] });

    log.debug("dropped");
    log.info("dropped");
    log.warn("dropped");
    log.error("kept");

    expect(sink.entries).toHaveLength(1);
    expect(sink.entries[0].level).toBe("error");
  });
});

// createLogger — entry structure

describe("createLogger entry structure", () => {
  test("entries have ts, level, msg", () => {
    const sink = createCaptureSink();
    const log = createLogger({ sinks: [sink] });

    log.info("test message");

    const entry = sink.entries[0];
    expect(entry.ts).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    expect(entry.level).toBe("info");
    expect(entry.msg).toBe("test message");
  });

  test("entries include meta when provided", () => {
    const sink = createCaptureSink();
    const log = createLogger({ sinks: [sink] });

    log.info("with meta", { key: "value", count: 42 });

    expect(sink.entries[0].meta).toEqual({ key: "value", count: 42 });
  });

  test("entries omit meta when not provided", () => {
    const sink = createCaptureSink();
    const log = createLogger({ sinks: [sink] });

    log.info("no meta");

    expect(sink.entries[0].meta).toBeUndefined();
  });

  test("entries omit meta when empty object is passed", () => {
    const sink = createCaptureSink();
    const log = createLogger({ sinks: [sink] });

    log.info("empty meta", {});

    expect(sink.entries[0].meta).toBeUndefined();
  });
});

// createLogger — child loggers

describe("createLogger child loggers", () => {
  test("child adds component to entries", () => {
    const sink = createCaptureSink();
    const log = createLogger({ sinks: [sink] });
    const child = log.child("server");

    child.info("started");

    expect(sink.entries[0].component).toBe("server");
  });

  test("grandchild chains component names", () => {
    const sink = createCaptureSink();
    const log = createLogger({ sinks: [sink] });
    const child = log.child("server");
    const grandchild = child.child("ws");

    grandchild.info("connected");

    expect(sink.entries[0].component).toBe("server.ws");
  });

  test("parent and child share the same sinks", () => {
    const sink = createCaptureSink();
    const log = createLogger({ sinks: [sink] });
    const child = log.child("executor");

    log.info("parent");
    child.info("child");

    expect(sink.entries).toHaveLength(2);
    expect(sink.entries[0].component).toBeUndefined();
    expect(sink.entries[1].component).toBe("executor");
  });

  test("child inherits level filtering", () => {
    const sink = createCaptureSink();
    const log = createLogger({ level: "warn", sinks: [sink] });
    const child = log.child("ws");

    child.debug("dropped");
    child.info("dropped");
    child.warn("kept");

    expect(sink.entries).toHaveLength(1);
  });
});

// createLogger — multiple sinks

describe("createLogger multiple sinks", () => {
  test("writes to all sinks", () => {
    const sink1 = createCaptureSink();
    const sink2 = createCaptureSink();
    const log = createLogger({ sinks: [sink1, sink2] });

    log.info("broadcast");

    expect(sink1.entries).toHaveLength(1);
    expect(sink2.entries).toHaveLength(1);
    expect(sink1.entries[0].msg).toBe("broadcast");
    expect(sink2.entries[0].msg).toBe("broadcast");
  });

  test("continues writing to other sinks if one throws", () => {
    const badSink: LogSink = {
      write() {
        throw new Error("sink error");
      },
    };
    const goodSink = createCaptureSink();
    const log = createLogger({ sinks: [badSink, goodSink] });

    // Should not throw
    log.info("still works");

    expect(goodSink.entries).toHaveLength(1);
  });
});

// createLogger — flush and close

describe("createLogger flush and close", () => {
  test("flush calls flush on all sinks", () => {
    let flushed1 = false;
    let flushed2 = false;
    const sink1: LogSink = {
      write() {},
      flush() {
        flushed1 = true;
      },
    };
    const sink2: LogSink = {
      write() {},
      flush() {
        flushed2 = true;
      },
    };
    const log = createLogger({ sinks: [sink1, sink2] });

    log.flush();

    expect(flushed1).toBe(true);
    expect(flushed2).toBe(true);
  });

  test("close calls flush then close on all sinks", () => {
    const order: string[] = [];
    const sink: LogSink = {
      write() {},
      flush() {
        order.push("flush");
      },
      close() {
        order.push("close");
      },
    };
    const log = createLogger({ sinks: [sink] });

    log.close();

    expect(order).toEqual(["flush", "close"]);
  });

  test("close handles sinks without close method", () => {
    const sink: LogSink = { write() {} };
    const log = createLogger({ sinks: [sink] });

    // Should not throw
    log.close();
  });
});

// createLogger — default sink (stderr)

describe("createLogger default sink", () => {
  test("writes to stderr when no sinks specified", () => {
    const stderrWrite = spyOn(process.stderr, "write").mockImplementation(
      () => true,
    );

    try {
      const log = createLogger();
      log.info("hello stderr");

      expect(stderrWrite).toHaveBeenCalledTimes(1);
      const written = stderrWrite.mock.calls[0][0] as string;
      expect(written).toContain('"level":"info"');
      expect(written).toContain('"msg":"hello stderr"');
      expect(written.endsWith("\n")).toBe(true);
    } finally {
      stderrWrite.mockRestore();
    }
  });
});

// StderrSink

describe("createStderrSink", () => {
  test("writes JSON lines to stderr", () => {
    const stderrWrite = spyOn(process.stderr, "write").mockImplementation(
      () => true,
    );

    try {
      const sink = createStderrSink();
      const entry: LogEntry = {
        ts: "2026-03-01T12:00:00.000Z",
        level: "warn",
        msg: "test",
      };
      sink.write(entry);

      expect(stderrWrite).toHaveBeenCalledTimes(1);
      const written = stderrWrite.mock.calls[0][0] as string;
      const parsed = JSON.parse(written.trim());
      expect(parsed.level).toBe("warn");
      expect(parsed.msg).toBe("test");
    } finally {
      stderrWrite.mockRestore();
    }
  });
});

// FileSink

describe("createFileSink", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  test("creates log file and writes entries", () => {
    const logFile = join(tempDir, "test.log");
    const sink = createFileSink(logFile);

    const entry: LogEntry = {
      ts: "2026-03-01T12:00:00.000Z",
      level: "info",
      msg: "file test",
    };
    sink.write(entry);

    const content = readFileSync(logFile, "utf-8");
    const parsed = JSON.parse(content.trim());
    expect(parsed.level).toBe("info");
    expect(parsed.msg).toBe("file test");
  });

  test("appends multiple entries", () => {
    const logFile = join(tempDir, "multi.log");
    const sink = createFileSink(logFile);

    sink.write({ ts: "2026-03-01T12:00:00.000Z", level: "info", msg: "first" });
    sink.write({
      ts: "2026-03-01T12:00:01.000Z",
      level: "warn",
      msg: "second",
    });

    const lines = readFileSync(logFile, "utf-8").trim().split("\n");
    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[0]).msg).toBe("first");
    expect(JSON.parse(lines[1]).msg).toBe("second");
  });

  test("creates parent directories if they don't exist", () => {
    const logFile = join(tempDir, "nested", "deep", "test.log");
    const sink = createFileSink(logFile);

    sink.write({
      ts: "2026-03-01T12:00:00.000Z",
      level: "info",
      msg: "nested",
    });

    expect(existsSync(logFile)).toBe(true);
    const parsed = JSON.parse(readFileSync(logFile, "utf-8").trim());
    expect(parsed.msg).toBe("nested");
  });

  test("truncates existing file on creation", () => {
    const logFile = join(tempDir, "truncate.log");

    // Write some initial content
    const sink1 = createFileSink(logFile);
    sink1.write({ ts: "2026-03-01T12:00:00.000Z", level: "info", msg: "old" });

    // Create new sink — should truncate
    const sink2 = createFileSink(logFile);
    sink2.write({ ts: "2026-03-01T12:00:01.000Z", level: "info", msg: "new" });

    const lines = readFileSync(logFile, "utf-8").trim().split("\n");
    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0]).msg).toBe("new");
  });
});

// SystemSink

describe("createSystemSink", () => {
  test("without forcePrefix writes plain JSON to stderr", () => {
    const stderrWrite = spyOn(process.stderr, "write").mockImplementation(
      () => true,
    );

    try {
      // On macOS/non-systemd, no prefix
      const sink = createSystemSink();
      sink.write({
        ts: "2026-03-01T12:00:00.000Z",
        level: "error",
        msg: "test",
      });

      const written = stderrWrite.mock.calls[0][0] as string;
      // Should not have syslog prefix unless running under systemd
      if (!process.env.JOURNAL_STREAM && !process.env.INVOCATION_ID) {
        expect(written.startsWith("{")).toBe(true);
      }
    } finally {
      stderrWrite.mockRestore();
    }
  });

  test("with forcePrefix adds syslog severity prefix", () => {
    const stderrWrite = spyOn(process.stderr, "write").mockImplementation(
      () => true,
    );

    try {
      const sink = createSystemSink({ forcePrefix: true });

      sink.write({
        ts: "2026-03-01T12:00:00.000Z",
        level: "error",
        msg: "err",
      });
      sink.write({ ts: "2026-03-01T12:00:00.000Z", level: "warn", msg: "wrn" });
      sink.write({ ts: "2026-03-01T12:00:00.000Z", level: "info", msg: "inf" });
      sink.write({
        ts: "2026-03-01T12:00:00.000Z",
        level: "debug",
        msg: "dbg",
      });

      const calls = stderrWrite.mock.calls.map((c) => c[0] as string);

      // <3> = error, <4> = warning, <6> = info, <7> = debug (RFC 5424)
      expect(calls[0]).toMatch(/^<3>\{/);
      expect(calls[1]).toMatch(/^<4>\{/);
      expect(calls[2]).toMatch(/^<6>\{/);
      expect(calls[3]).toMatch(/^<7>\{/);

      // The JSON part should still be valid
      const jsonPart = calls[0].replace(/^<\d>/, "").trim();
      const parsed = JSON.parse(jsonPart);
      expect(parsed.level).toBe("error");
    } finally {
      stderrWrite.mockRestore();
    }
  });

  test("forcePrefix entries end with newline", () => {
    const stderrWrite = spyOn(process.stderr, "write").mockImplementation(
      () => true,
    );

    try {
      const sink = createSystemSink({ forcePrefix: true });
      sink.write({
        ts: "2026-03-01T12:00:00.000Z",
        level: "info",
        msg: "test",
      });

      const written = stderrWrite.mock.calls[0][0] as string;
      expect(written.endsWith("\n")).toBe(true);
    } finally {
      stderrWrite.mockRestore();
    }
  });
});

// describeSystemLogging

describe("describeSystemLogging", () => {
  test("returns a non-empty description", () => {
    const desc = describeSystemLogging();
    expect(desc.length).toBeGreaterThan(0);
  });

  test("mentions the current platform", () => {
    const desc = describeSystemLogging();
    // Should mention stderr at minimum
    expect(desc).toContain("stderr");
  });
});

// Integration: createLogger + FileSink

describe("createLogger with FileSink integration", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  test("writes structured logs to file via logger", () => {
    const logFile = join(tempDir, "integrated.log");
    const log = createLogger({
      level: "debug",
      sinks: [createFileSink(logFile)],
    });

    log.debug("debug msg", { key: "val" });
    log.info("info msg");
    log.warn("warn msg");
    log.error("error msg", { code: 500 });

    const lines = readFileSync(logFile, "utf-8").trim().split("\n");
    expect(lines).toHaveLength(4);

    const entries = lines.map((l) => JSON.parse(l));
    expect(entries[0].level).toBe("debug");
    expect(entries[0].msg).toBe("debug msg");
    expect(entries[0].key).toBe("val");
    expect(entries[1].level).toBe("info");
    expect(entries[2].level).toBe("warn");
    expect(entries[3].level).toBe("error");
    expect(entries[3].code).toBe(500);
  });

  test("child logger component appears in file output", () => {
    const logFile = join(tempDir, "child.log");
    const log = createLogger({ sinks: [createFileSink(logFile)] });
    const child = log.child("executor");

    child.info("flow started", { runId: "run-1" });

    const entry = JSON.parse(readFileSync(logFile, "utf-8").trim());
    expect(entry.component).toBe("executor");
    expect(entry.runId).toBe("run-1");
  });

  test("multi-sink: stderr + file", () => {
    const stderrWrite = spyOn(process.stderr, "write").mockImplementation(
      () => true,
    );

    try {
      const logFile = join(tempDir, "multi.log");
      const log = createLogger({
        sinks: [createStderrSink(), createFileSink(logFile)],
      });

      log.info("both sinks");

      // Stderr got it
      expect(stderrWrite).toHaveBeenCalledTimes(1);

      // File got it
      const fileEntry = JSON.parse(readFileSync(logFile, "utf-8").trim());
      expect(fileEntry.msg).toBe("both sinks");
    } finally {
      stderrWrite.mockRestore();
    }
  });
});

// Integration: createLogger + SystemSink

describe("createLogger with SystemSink integration", () => {
  test("system sink with forced prefix through logger", () => {
    const stderrWrite = spyOn(process.stderr, "write").mockImplementation(
      () => true,
    );

    try {
      const log = createLogger({
        level: "debug",
        sinks: [createSystemSink({ forcePrefix: true })],
      });

      log.error("system error");
      log.info("system info");

      const calls = stderrWrite.mock.calls.map((c) => c[0] as string);
      expect(calls[0]).toMatch(/^<3>/); // error = syslog 3
      expect(calls[1]).toMatch(/^<6>/); // info = syslog 6
    } finally {
      stderrWrite.mockRestore();
    }
  });
});
