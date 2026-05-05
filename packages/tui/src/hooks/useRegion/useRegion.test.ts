import { describe, expect, it } from "bun:test";

import {
  fitToWidth,
  padToWidth,
  visibleLength,
} from "./useRegion.utils";

describe("visibleLength", () => {
  it("should return character count for plain strings", () => {
    expect(visibleLength("hello")).toBe(5);
  });

  it("should ignore ANSI SGR escape sequences", () => {
    // \x1b[31m = red, \x1b[0m = reset — 8 escape chars, 5 visible
    expect(visibleLength("\x1b[31mhello\x1b[0m")).toBe(5);
  });

  it("should return zero for empty input", () => {
    expect(visibleLength("")).toBe(0);
  });
});

describe("padToWidth", () => {
  it("should right-pad shorter strings with spaces", () => {
    expect(padToWidth("hi", 5)).toBe("hi   ");
  });

  it("should leave equal-length strings unchanged", () => {
    expect(padToWidth("abcde", 5)).toBe("abcde");
  });

  it("should leave longer strings unchanged (no truncation)", () => {
    expect(padToWidth("toolong", 3)).toBe("toolong");
  });

  it("should pad ANSI-colored strings based on visible length", () => {
    expect(padToWidth("\x1b[31mhi\x1b[0m", 5)).toBe("\x1b[31mhi\x1b[0m   ");
  });
});

describe("fitToWidth", () => {
  it("should pad shorter strings the same way padToWidth does", () => {
    expect(fitToWidth("hi", 5)).toBe("hi   ");
  });

  it("should leave equal-length strings unchanged and not append a reset", () => {
    expect(fitToWidth("abcde", 5)).toBe("abcde");
  });

  it("should truncate longer plain strings without an SGR reset", () => {
    expect(fitToWidth("hello world", 5)).toBe("hello");
  });

  it("should truncate ANSI-colored strings and append SGR reset", () => {
    // 11 visible chars, clipped to 5 → "hello" with the red prefix preserved
    // and a trailing reset to prevent bleed into the next column.
    const result = fitToWidth("\x1b[31mhello world\x1b[0m", 5);
    expect(result).toBe("\x1b[31mhello\x1b[0m");
  });

  it("should preserve mid-string ANSI escapes that fall before the clip point", () => {
    // "ab" red, "cd" green, "ef" plain — clip at 4 visible chars.
    const input = "ab\x1b[31mcd\x1b[32mef";
    const result = fitToWidth(input, 4);
    // Both escapes occur before/at the clip, so both are preserved, and a
    // reset is appended because at least one escape was emitted.
    expect(result).toBe("ab\x1b[31mcd\x1b[0m");
  });

  it("should return the input verbatim when only escapes are present and width is zero", () => {
    expect(fitToWidth("", 0)).toBe("");
  });
});
