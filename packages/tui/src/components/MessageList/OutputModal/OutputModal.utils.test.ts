import { describe, expect, it } from "bun:test";

import { compileQuery, filterAndHighlight } from "./OutputModal.utils";

describe("compileQuery", () => {
  it("returns a null regex for the empty string", () => {
    const result = compileQuery("");
    expect(result.regex).toBeNull();
    expect(result.invalid).toBe(false);
    expect(result.raw).toBe("");
  });

  it("returns a null regex for whitespace-only input", () => {
    const result = compileQuery("   ");
    expect(result.regex).toBeNull();
    expect(result.invalid).toBe(false);
  });

  it("compiles a valid pattern into a global, case-insensitive regex", () => {
    const result = compileQuery("foo");
    expect(result.regex).not.toBeNull();
    expect(result.regex?.flags).toContain("g");
    expect(result.regex?.flags).toContain("i");
    expect(result.invalid).toBe(false);
  });

  it("flags an invalid regex without throwing", () => {
    const result = compileQuery("[unterminated");
    expect(result.regex).toBeNull();
    expect(result.invalid).toBe(true);
    expect(result.raw).toBe("[unterminated");
  });
});

describe("filterAndHighlight", () => {
  it("returns every line as a single non-matching segment when regex is null", () => {
    const lines = filterAndHighlight("a\nb\nc", null);
    expect(lines).toHaveLength(3);
    expect(lines[0]?.lineNumber).toBe(1);
    expect(lines[2]?.lineNumber).toBe(3);
    for (const line of lines) {
      expect(line.segments).toHaveLength(1);
      expect(line.segments[0]?.isMatch).toBe(false);
    }
  });

  it("preserves trailing empty lines from the source body", () => {
    const lines = filterAndHighlight("a\n\n", null);
    // "a\n\n".split("\n") => ["a", "", ""] — 3 entries.
    expect(lines).toHaveLength(3);
    expect(lines[1]?.segments[0]?.text).toBe("");
    expect(lines[2]?.segments[0]?.text).toBe("");
  });

  it("filters out lines that do not contain a match", () => {
    const regex = /foo/gi;
    const lines = filterAndHighlight("foo line\nbar line\nfoo again", regex);
    expect(lines).toHaveLength(2);
    expect(lines[0]?.lineNumber).toBe(1);
    expect(lines[1]?.lineNumber).toBe(3);
  });

  it("segments matching slices into separate runs", () => {
    const regex = /foo/gi;
    const lines = filterAndHighlight("xfooyfooz", regex);
    expect(lines).toHaveLength(1);
    const segments = lines[0]?.segments ?? [];
    expect(segments.map((segment) => segment.text)).toEqual([
      "x",
      "foo",
      "y",
      "foo",
      "z",
    ]);
    expect(segments.map((segment) => segment.isMatch)).toEqual([
      false,
      true,
      false,
      true,
      false,
    ]);
  });

  it("emits leading match without an empty non-match prefix", () => {
    const regex = /foo/gi;
    const lines = filterAndHighlight("foobar", regex);
    expect(lines).toHaveLength(1);
    const segments = lines[0]?.segments ?? [];
    expect(segments[0]?.text).toBe("foo");
    expect(segments[0]?.isMatch).toBe(true);
    expect(segments[1]?.text).toBe("bar");
    expect(segments[1]?.isMatch).toBe(false);
  });

  it("matches case-insensitively when the regex flag set includes 'i'", () => {
    const regex = /foo/gi;
    const lines = filterAndHighlight("FOObar", regex);
    expect(lines).toHaveLength(1);
    expect(lines[0]?.segments[0]?.text).toBe("FOO");
    expect(lines[0]?.segments[0]?.isMatch).toBe(true);
  });

  it("falls back to a non-matching segment for zero-length-match regexes", () => {
    // `^` matches at position 0 with length 0 — the segmenter must
    // not loop forever; it should mark the line as no-match instead.
    const regex = /^/g;
    const lines = filterAndHighlight("hello", regex);
    // No actual match content — the line is filtered out (no isMatch).
    expect(lines).toHaveLength(0);
  });

  it("treats an empty source line as a single empty non-matching segment", () => {
    const lines = filterAndHighlight("", null);
    expect(lines).toHaveLength(1);
    expect(lines[0]?.segments).toEqual([{ text: "", isMatch: false }]);
  });

  it("auto-adds the global flag when the supplied regex lacks it", () => {
    // `compileQuery` always produces global regexes, but a caller could
    // pass a hand-built regex. The segmenter must still walk every match.
    const regex = /a/i;
    const lines = filterAndHighlight("aXa", regex);
    expect(lines).toHaveLength(1);
    const matchTexts = lines[0]?.segments
      .filter((segment) => segment.isMatch)
      .map((segment) => segment.text);
    expect(matchTexts).toEqual(["a", "a"]);
  });
});
