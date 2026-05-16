import { describe, expect, it } from "bun:test";
import { errorResult, okResult, toolError } from "./result";

describe("okResult", () => {
  it("should produce ok=true with no error", () => {
    const result = okResult("hello");
    expect(result.ok).toBe(true);
    expect(result.output).toBe("hello");
    expect(result.error).toBeUndefined();
    expect(result.data).toBeUndefined();
    expect(result.metadata).toBeUndefined();
  });

  it("should attach data when provided", () => {
    const result = okResult("done", { data: { count: 3 } });
    expect(result.data).toEqual({ count: 3 });
  });

  it("should attach metadata when provided", () => {
    const result = okResult("done", { metadata: { source: "test" } });
    expect(result.metadata).toEqual({ source: "test" });
  });

  it("should omit data/metadata keys entirely when undefined", () => {
    const result = okResult("x", { data: undefined, metadata: undefined });
    expect("data" in result).toBe(false);
    expect("metadata" in result).toBe(false);
  });
});

describe("errorResult", () => {
  it("should produce ok=false with error attached", () => {
    const result = errorResult({
      kind: "not_found",
      message: "missing",
      recoverable: false,
    });
    expect(result.ok).toBe(false);
    expect(result.error?.kind).toBe("not_found");
    expect(result.output).toBe("missing");
  });

  it("should let output override the error message", () => {
    const result = errorResult(
      { kind: "unknown", message: "raw", recoverable: false },
      { output: "friendly" },
    );
    expect(result.output).toBe("friendly");
    expect(result.error?.message).toBe("raw");
  });

  it("should attach data alongside the error", () => {
    const result = errorResult(
      { kind: "binary_file", message: "binary", recoverable: true },
      { data: { sizeBytes: 1024 } },
    );
    expect(result.data).toEqual({ sizeBytes: 1024 });
  });
});

describe("toolError", () => {
  it("should default recoverable to false", () => {
    const error = toolError("not_found", "x");
    expect(error.recoverable).toBe(false);
  });

  it("should pass through optional fields", () => {
    const error = toolError("stale_file", "stale", {
      path: "/a/b",
      recoverable: true,
      suggestedNextAction: "re-read",
      details: { currentSha256: "abc" },
    });
    expect(error.path).toBe("/a/b");
    expect(error.recoverable).toBe(true);
    expect(error.suggestedNextAction).toBe("re-read");
    expect(error.details).toEqual({ currentSha256: "abc" });
  });

  it("should omit undefined optional fields", () => {
    const error = toolError("unknown", "x");
    expect("path" in error).toBe(false);
    expect("details" in error).toBe(false);
    expect("suggestedNextAction" in error).toBe(false);
  });
});
