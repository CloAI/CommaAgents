import { describe, expect, it } from "bun:test";

import {
  _resetLogIdCounterForTests,
  formatArgs,
  nextLogId,
} from "./useLogs.utils";

describe("nextLogId", () => {
  it("should return monotonically increasing ids", () => {
    _resetLogIdCounterForTests();
    expect(nextLogId()).toBe("log-1");
    expect(nextLogId()).toBe("log-2");
    expect(nextLogId()).toBe("log-3");
  });

  it("should never return duplicate ids across many calls", () => {
    _resetLogIdCounterForTests();
    const ids = new Set<string>();
    for (let index = 0; index < 1000; index += 1) {
      ids.add(nextLogId());
    }
    expect(ids.size).toBe(1000);
  });
});

describe("formatArgs", () => {
  it("should pass strings through verbatim", () => {
    expect(formatArgs(["hello"])).toBe("hello");
  });

  it("should join multiple string args with a single space", () => {
    expect(formatArgs(["hello", "world"])).toBe("hello world");
  });

  it("should inspect plain objects", () => {
    const formatted = formatArgs([{ a: 1, b: "two" }]);
    expect(formatted).toContain("a: 1");
    expect(formatted).toContain("b: 'two'");
  });

  it("should handle Error instances with stack info", () => {
    const error = new Error("boom");
    const formatted = formatArgs([error]);
    expect(formatted).toContain("Error: boom");
    expect(formatted).toContain("at "); // stack frame marker
  });

  it("should handle circular references without throwing", () => {
    const circular: Record<string, unknown> = { name: "loop" };
    circular.self = circular;
    const formatted = formatArgs([circular]);
    expect(formatted).toContain("Circular");
    expect(formatted).toContain("loop");
  });

  it("should handle BigInt without throwing", () => {
    expect(formatArgs([10n])).toBe("10n");
  });

  it("should handle Symbol without throwing", () => {
    expect(formatArgs([Symbol("tag")])).toContain("Symbol(tag)");
  });

  it("should handle undefined and null", () => {
    expect(formatArgs([undefined])).toBe("undefined");
    expect(formatArgs([null])).toBe("null");
  });

  it("should mix strings and objects in order", () => {
    const formatted = formatArgs(["status:", { code: 200 }]);
    expect(formatted.startsWith("status: ")).toBe(true);
    expect(formatted).toContain("code: 200");
  });

  it("should return an empty string for an empty arg list", () => {
    expect(formatArgs([])).toBe("");
  });
});
