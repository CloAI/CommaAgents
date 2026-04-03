// Tests for string utilities.

import { describe, expect, it } from "bun:test";
import { breakLines, capitalize, collapseNewlines, countOccurrences, truncateText } from "./string";

describe("capitalize", () => {
  it("should capitalize the first letter", () => {
    expect(capitalize("openai")).toBe("Openai");
    expect(capitalize("anthropic")).toBe("Anthropic");
  });

  it("should return empty string unchanged", () => {
    expect(capitalize("")).toBe("");
  });

  it("should leave already capitalized strings unchanged", () => {
    expect(capitalize("Hello")).toBe("Hello");
  });

  it("should handle single character", () => {
    expect(capitalize("a")).toBe("A");
  });
});

describe("truncateText", () => {
  it("should truncate text exceeding max and add ellipsis", () => {
    expect(truncateText("hello world", 5)).toBe("hello...");
  });

  it("should return text unchanged when within max", () => {
    expect(truncateText("hello", 10)).toBe("hello");
  });

  it("should return text unchanged when exactly at max", () => {
    expect(truncateText("hello", 5)).toBe("hello");
  });

  it("should return text unchanged when max is 0 (no truncation)", () => {
    expect(truncateText("hello world", 0)).toBe("hello world");
  });

  it("should return empty string unchanged", () => {
    expect(truncateText("", 5)).toBe("");
  });
});

describe("collapseNewlines", () => {
  it("should replace newlines with visible markers", () => {
    expect(collapseNewlines("line1\nline2")).toBe("line1\\nline2");
  });

  it("should handle multiple newlines", () => {
    expect(collapseNewlines("a\nb\nc")).toBe("a\\nb\\nc");
  });

  it("should return text unchanged when no newlines", () => {
    expect(collapseNewlines("no newlines")).toBe("no newlines");
  });

  it("should handle empty string", () => {
    expect(collapseNewlines("")).toBe("");
  });
});

describe("breakLines", () => {
  it("should wrap a long line at the last space before width", () => {
    const result = breakLines("the quick brown fox jumps over", 20);
    const lines = result.split("\n");
    expect(lines.length).toBeGreaterThan(1);
    for (const line of lines) {
      expect(line.length).toBeLessThanOrEqual(20);
    }
  });

  it("should return short lines unchanged", () => {
    expect(breakLines("short", 20)).toBe("short");
  });

  it("should return line unchanged when width is 0", () => {
    expect(breakLines("hello world", 0)).toBe("hello world");
  });

  it("should preserve leading whitespace as continuation indent", () => {
    const result = breakLines("  indented text that is longer than the width", 20);
    const lines = result.split("\n");
    // Continuation lines should also have the leading indent
    if (lines.length > 1) {
      expect(lines[1]!.startsWith("  ")).toBe(true);
    }
  });

  it("should handle a single word longer than width", () => {
    // No space to break on — the word should be emitted whole
    const result = breakLines("superlongwordwithoutanyspaces", 10);
    expect(result).toBe("superlongwordwithoutanyspaces");
  });
});

describe("countOccurrences", () => {
  it("should count non-overlapping occurrences", () => {
    expect(countOccurrences("abcabc", "abc")).toBe(2);
  });

  it("should return 0 for no matches", () => {
    expect(countOccurrences("hello", "xyz")).toBe(0);
  });

  it("should return 0 for empty search string", () => {
    expect(countOccurrences("hello", "")).toBe(0);
  });

  it("should handle single character search", () => {
    expect(countOccurrences("aaa", "a")).toBe(3);
  });

  it("should not count overlapping matches", () => {
    expect(countOccurrences("aaaa", "aa")).toBe(2);
  });

  it("should handle empty content", () => {
    expect(countOccurrences("", "abc")).toBe(0);
  });
});
