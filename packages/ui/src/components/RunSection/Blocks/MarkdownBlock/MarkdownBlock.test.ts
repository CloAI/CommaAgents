import { describe, expect, it } from "vitest";
import { allowUrl, normalizeMathDelimiters } from "./MarkdownBlock.utils";

describe("normalizeMathDelimiters", () => {
  it("should turn parenthesised math into inline math", () => {
    expect(normalizeMathDelimiters("Area is \\( \\pi r^2 \\).")).toBe(
      "Area is $\\pi r^2$.",
    );
  });

  it("should turn bracketed math into display math", () => {
    expect(normalizeMathDelimiters("So \\[ x = 1 \\] holds")).toBe(
      "So \n\n$$\nx = 1\n$$\n\n holds",
    );
  });

  it("should leave code fences and code spans alone", () => {
    const text = "Use `\\(a\\)` and\n```\n\\[b\\]\n```\n";
    expect(normalizeMathDelimiters(text)).toBe(text);
  });

  it("should leave an unclosed delimiter as typed while streaming", () => {
    expect(normalizeMathDelimiters("So \\[ x =")).toBe("So \\[ x =");
  });

  it("should leave dollar math untouched", () => {
    expect(normalizeMathDelimiters("$a$ and $$b$$")).toBe("$a$ and $$b$$");
  });
});

describe("allowUrl", () => {
  it("should allow web and mail links", () => {
    expect(allowUrl("https://example.com")).toBe("https://example.com");
    expect(allowUrl("http://example.com")).toBe("http://example.com");
    expect(allowUrl("mailto:a@example.com")).toBe("mailto:a@example.com");
  });

  it("should reject script, data and relative links", () => {
    expect(allowUrl("javascript:alert(1)")).toBeUndefined();
    expect(allowUrl("data:text/html,x")).toBeUndefined();
    expect(allowUrl("/relative")).toBeUndefined();
  });
});
