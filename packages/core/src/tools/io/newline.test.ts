import { describe, expect, it } from "bun:test";
import { applyNewline, detectNewline, toLF } from "./newline";

describe("detectNewline", () => {
  it("returns 'none' for content without newlines", () => {
    expect(detectNewline("")).toBe("none");
    expect(detectNewline("single line")).toBe("none");
  });

  it("returns 'lf' for pure Unix line endings", () => {
    expect(detectNewline("a\nb\nc")).toBe("lf");
  });

  it("returns 'crlf' for pure Windows line endings", () => {
    expect(detectNewline("a\r\nb\r\nc")).toBe("crlf");
  });

  it("returns 'mixed' when both styles appear", () => {
    expect(detectNewline("a\r\nb\nc")).toBe("mixed");
  });
});

describe("toLF", () => {
  it("converts CRLF to LF", () => {
    expect(toLF("a\r\nb\r\nc")).toBe("a\nb\nc");
  });

  it("leaves LF-only content unchanged", () => {
    expect(toLF("a\nb")).toBe("a\nb");
  });
});

describe("applyNewline", () => {
  it("rewrites LF as CRLF when style is 'crlf'", () => {
    expect(applyNewline("a\nb\nc", "crlf")).toBe("a\r\nb\r\nc");
  });

  it("normalises existing CRLF to CRLF (idempotent) when style is 'crlf'", () => {
    expect(applyNewline("a\r\nb\nc", "crlf")).toBe("a\r\nb\r\nc");
  });

  it("leaves content unchanged for lf/mixed/none", () => {
    expect(applyNewline("a\nb", "lf")).toBe("a\nb");
    expect(applyNewline("a\nb", "mixed")).toBe("a\nb");
    expect(applyNewline("ab", "none")).toBe("ab");
  });
});
