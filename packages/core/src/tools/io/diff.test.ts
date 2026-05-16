import { describe, expect, it } from "bun:test";
import { unifiedDiff } from "./diff";

describe("unifiedDiff", () => {
  it("returns an empty string for identical inputs", () => {
    expect(unifiedDiff("hello\n", "hello\n", { path: "f.txt" })).toBe("");
  });

  it("emits a unified diff for a simple change", () => {
    const diff = unifiedDiff("line1\nline2\n", "line1\nline two\n", {
      path: "f.txt",
    });
    expect(diff).toContain("--- f.txt");
    expect(diff).toContain("+++ f.txt");
    expect(diff).toContain("-line2");
    expect(diff).toContain("+line two");
  });

  it("respects custom context lines", () => {
    const before = "a\nb\nc\nd\ne\nf\ng\n";
    const after = "a\nb\nc\nD\ne\nf\ng\n";
    const tight = unifiedDiff(before, after, { path: "x", contextLines: 0 });
    const wide = unifiedDiff(before, after, { path: "x", contextLines: 5 });
    // Wider context produces a longer diff
    expect(wide.length).toBeGreaterThan(tight.length);
  });
});
