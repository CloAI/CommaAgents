import { afterEach, beforeEach, describe, expect, it } from "bun:test";

import { createLogStore } from "./logStore";
import type { LogStore } from "./useLogs.types";

/**
 * Snapshot the real console + stdio so each test can install a fresh
 * `createLogStore` instance and reliably restore the global state after.
 */
const realConsole = {
  log: console.log,
  info: console.info,
  warn: console.warn,
  error: console.error,
  debug: console.debug,
};
const realStdoutWrite = process.stdout.write.bind(process.stdout);
const realStderrWrite = process.stderr.write.bind(process.stderr);

interface CapturedOutput {
  stdout: string[];
  stderr: string[];
}

function captureStdio(): CapturedOutput {
  const captured: CapturedOutput = { stdout: [], stderr: [] };
  process.stdout.write = ((chunk: string | Uint8Array) => {
    captured.stdout.push(typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf8"));
    return true;
  }) as typeof process.stdout.write;
  process.stderr.write = ((chunk: string | Uint8Array) => {
    captured.stderr.push(typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf8"));
    return true;
  }) as typeof process.stderr.write;
  return captured;
}

function restoreStdio(): void {
  process.stdout.write = realStdoutWrite;
  process.stderr.write = realStderrWrite;
}

function restoreConsole(): void {
  console.log = realConsole.log;
  console.info = realConsole.info;
  console.warn = realConsole.warn;
  console.error = realConsole.error;
  console.debug = realConsole.debug;
}

describe("createLogStore", () => {
  let store: LogStore;
  let captured: CapturedOutput;

  beforeEach(() => {
    captured = captureStdio();
    store = createLogStore();
  });

  afterEach(() => {
    store.destroy();
    restoreStdio();
    restoreConsole();
  });

  describe("console hijack", () => {
    it("should replace all five console methods", () => {
      expect(console.log).not.toBe(realConsole.log);
      expect(console.info).not.toBe(realConsole.info);
      expect(console.warn).not.toBe(realConsole.warn);
      expect(console.error).not.toBe(realConsole.error);
      expect(console.debug).not.toBe(realConsole.debug);
    });

    it("should capture console.log into the store", () => {
      console.log("hello");
      const entries = store.getSnapshot();
      expect(entries.length).toBe(1);
      expect(entries[0].level).toBe("log");
      expect(entries[0].message).toBe("hello");
    });

    it("should capture all five log levels with the correct level tag", () => {
      console.log("a");
      console.info("b");
      console.warn("c");
      console.error("d");
      console.debug("e");

      const entries = store.getSnapshot();
      expect(entries.map((entry) => entry.level)).toEqual([
        "log",
        "info",
        "warn",
        "error",
        "debug",
      ]);
      expect(entries.map((entry) => entry.message)).toEqual(["a", "b", "c", "d", "e"]);
    });

    it("should format multi-argument calls into a single space-separated message", () => {
      console.log("status:", { code: 200 });
      const [entry] = store.getSnapshot();
      expect(entry.message.startsWith("status: ")).toBe(true);
      expect(entry.message).toContain("code: 200");
    });

    it("should capture Error objects with stack info", () => {
      console.error(new Error("boom"));
      const [entry] = store.getSnapshot();
      expect(entry.level).toBe("error");
      expect(entry.message).toContain("Error: boom");
    });
  });

  describe("pass-through mode (uncommitted)", () => {
    it("should default to pass-through mode", () => {
      expect(store.isCommitted()).toBe(false);
    });

    it("should forward console.log to stdout while uncommitted", () => {
      console.log("hello");
      expect(captured.stdout.join("")).toBe("hello\n");
    });

    it("should forward console.info to stdout while uncommitted", () => {
      console.info("info-msg");
      expect(captured.stdout.join("")).toBe("info-msg\n");
    });

    it("should forward console.warn / error / debug to stderr while uncommitted", () => {
      console.warn("w");
      console.error("e");
      console.debug("d");
      expect(captured.stderr.join("")).toBe("w\ne\nd\n");
      expect(captured.stdout.join("")).toBe("");
    });

    it("should still buffer entries while in pass-through mode", () => {
      console.log("hello");
      expect(store.getSnapshot().length).toBe(1);
    });
  });

  describe("commit (capture mode)", () => {
    it("should mark the store as committed", () => {
      store.commit();
      expect(store.isCommitted()).toBe(true);
    });

    it("should stop forwarding to stdout/stderr after commit", () => {
      store.commit();
      console.log("after-commit-log");
      console.error("after-commit-err");
      expect(captured.stdout.join("")).toBe("");
      expect(captured.stderr.join("")).toBe("");
    });

    it("should still capture entries after commit", () => {
      store.commit();
      console.log("after-commit");
      const entries = store.getSnapshot();
      expect(entries.length).toBe(1);
      expect(entries[0].message).toBe("after-commit");
    });

    it("should preserve pre-commit entries when commit is called", () => {
      console.log("before");
      store.commit();
      console.log("after");
      const entries = store.getSnapshot();
      expect(entries.map((entry) => entry.message)).toEqual(["before", "after"]);
    });
  });

  describe("push", () => {
    it("should append a synthetic entry without going through console", () => {
      store.push("error", "synthetic");
      const [entry] = store.getSnapshot();
      expect(entry.level).toBe("error");
      expect(entry.message).toBe("synthetic");
    });

    it("should not forward push entries to stdout/stderr even when uncommitted", () => {
      store.push("error", "synthetic");
      expect(captured.stdout.join("")).toBe("");
      expect(captured.stderr.join("")).toBe("");
    });
  });

  describe("snapshot stability", () => {
    it("should return the same array reference between mutations", () => {
      console.log("a");
      const first = store.getSnapshot();
      const second = store.getSnapshot();
      expect(first).toBe(second);
    });

    it("should return a new array reference after a new entry", () => {
      console.log("a");
      const first = store.getSnapshot();
      console.log("b");
      const second = store.getSnapshot();
      expect(first).not.toBe(second);
      expect(second.length).toBe(2);
    });

    it("should return a new array reference after clear()", () => {
      console.log("a");
      const first = store.getSnapshot();
      store.clear();
      const second = store.getSnapshot();
      expect(first).not.toBe(second);
      expect(second.length).toBe(0);
    });
  });

  describe("subscribe", () => {
    it("should notify a subscriber on every new entry", () => {
      let calls = 0;
      const unsubscribe = store.subscribe(() => {
        calls += 1;
      });
      console.log("a");
      console.log("b");
      console.log("c");
      expect(calls).toBe(3);
      unsubscribe();
    });

    it("should notify on clear()", () => {
      let calls = 0;
      const unsubscribe = store.subscribe(() => {
        calls += 1;
      });
      store.clear();
      expect(calls).toBe(1);
      unsubscribe();
    });

    it("should stop notifying after unsubscribe", () => {
      let calls = 0;
      const unsubscribe = store.subscribe(() => {
        calls += 1;
      });
      console.log("a");
      unsubscribe();
      console.log("b");
      expect(calls).toBe(1);
    });

    it("should support multiple subscribers", () => {
      let aCalls = 0;
      let bCalls = 0;
      const unsubA = store.subscribe(() => {
        aCalls += 1;
      });
      const unsubB = store.subscribe(() => {
        bCalls += 1;
      });
      console.log("hi");
      expect(aCalls).toBe(1);
      expect(bCalls).toBe(1);
      unsubA();
      unsubB();
    });

    it("should isolate a throwing subscriber from other subscribers", () => {
      let goodCalls = 0;
      const unsubBad = store.subscribe(() => {
        throw new Error("subscriber failure");
      });
      const unsubGood = store.subscribe(() => {
        goodCalls += 1;
      });
      console.log("hi");
      expect(goodCalls).toBe(1);
      unsubBad();
      unsubGood();
    });
  });

  describe("clear", () => {
    it("should empty the entries", () => {
      console.log("a");
      console.log("b");
      store.clear();
      expect(store.getSnapshot()).toEqual([]);
    });
  });

  describe("max entries cap", () => {
    it("should drop the oldest entries once the cap is exceeded", () => {
      const small = createLogStore(3);
      try {
        console.log("1");
        console.log("2");
        console.log("3");
        console.log("4");
        const messages = small.getSnapshot().map((entry) => entry.message);
        expect(messages).toEqual(["2", "3", "4"]);
      } finally {
        small.destroy();
      }
    });
  });

  describe("destroy", () => {
    it("should restore the console methods that were active when the store was created", () => {
      // The outer `store` (from beforeEach) has already hijacked the console,
      // so we capture *that* state — not the original real console — as the
      // baseline this nested store should restore to.
      const baselineLog = console.log;
      const baselineInfo = console.info;
      const baselineWarn = console.warn;
      const baselineError = console.error;
      const baselineDebug = console.debug;

      const nested = createLogStore();
      expect(console.log).not.toBe(baselineLog);
      nested.destroy();

      expect(console.log).toBe(baselineLog);
      expect(console.info).toBe(baselineInfo);
      expect(console.warn).toBe(baselineWarn);
      expect(console.error).toBe(baselineError);
      expect(console.debug).toBe(baselineDebug);
    });
  });

  describe("entry shape", () => {
    it("should include id, timestamp, level, and message", () => {
      const before = Date.now();
      console.log("entry");
      const after = Date.now();
      const [entry] = store.getSnapshot();
      expect(typeof entry.id).toBe("string");
      expect(entry.id.length).toBeGreaterThan(0);
      expect(entry.timestamp).toBeGreaterThanOrEqual(before);
      expect(entry.timestamp).toBeLessThanOrEqual(after);
      expect(entry.level).toBe("log");
      expect(entry.message).toBe("entry");
    });

    it("should give every entry a unique id", () => {
      console.log("a");
      console.log("b");
      console.log("c");
      const ids = store.getSnapshot().map((entry) => entry.id);
      expect(new Set(ids).size).toBe(ids.length);
    });
  });
});
