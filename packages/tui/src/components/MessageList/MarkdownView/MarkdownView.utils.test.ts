import { describe, expect, it } from "bun:test";
import { THINKING_ELLIPSIS_LINE } from "./MarkdownView.constants";
import {
  inlineSpansToPlainText,
  renderTableToText,
  tokenizeMarkdown,
  truncateThinking,
  truncateToLastNLines,
} from "./MarkdownView.utils";

describe("tokenizeMarkdown", () => {
  it("returns an empty array for empty input", () => {
    expect(tokenizeMarkdown("")).toEqual([]);
  });

  it("emits a paragraph block for simple prose", () => {
    const blocks = tokenizeMarkdown("hello world");
    expect(blocks).toHaveLength(1);
    expect(blocks[0]?.kind).toBe("paragraph");
  });

  it("preserves inline strong/em/code/link spans inside a paragraph", () => {
    const blocks = tokenizeMarkdown(
      "**bold** and *em* with `code` and [text](https://x)",
    );
    expect(blocks).toHaveLength(1);
    const block = blocks[0];
    if (block?.kind !== "paragraph") {
      throw new Error("expected paragraph");
    }
    const kinds = block.children.map((c) => c.kind);
    expect(kinds).toContain("strong");
    expect(kinds).toContain("em");
    expect(kinds).toContain("code");
    expect(kinds).toContain("link");
  });

  it("clamps heading depth into the 1..6 range", () => {
    const blocks = tokenizeMarkdown("###### deep");
    const block = blocks[0];
    if (block?.kind !== "heading") throw new Error("expected heading");
    expect(block.depth).toBe(6);
  });

  it("emits a list with ordered + start metadata", () => {
    const blocks = tokenizeMarkdown("3. one\n4. two");
    const block = blocks[0];
    if (block?.kind !== "list") throw new Error("expected list");
    expect(block.ordered).toBe(true);
    expect(block.start).toBe(3);
    expect(block.items).toHaveLength(2);
  });

  it("captures nested blocks under a list item", () => {
    const blocks = tokenizeMarkdown("- top\n  - nested");
    const list = blocks[0];
    if (list?.kind !== "list") throw new Error("expected list");
    expect(list.items[0]?.nested[0]?.kind).toBe("list");
  });

  it("auto-closes an unfinished fenced block as a code block", () => {
    const blocks = tokenizeMarkdown("```ts\nincomplete");
    const block = blocks[0];
    if (block?.kind !== "code") throw new Error("expected code");
    expect(block.language).toBe("ts");
    expect(block.value).toBe("incomplete");
  });

  it("recognises horizontal rules", () => {
    const blocks = tokenizeMarkdown("---");
    expect(blocks[0]?.kind).toBe("hr");
  });

  it("parses tables into header + rows", () => {
    const blocks = tokenizeMarkdown("| a | b |\n|---|---|\n| 1 | 2 |");
    const block = blocks[0];
    if (block?.kind !== "table") throw new Error("expected table");
    expect(block.header).toHaveLength(2);
    expect(block.rows).toHaveLength(1);
  });
});

describe("inlineSpansToPlainText", () => {
  it("flattens nested strong/em wrappers", () => {
    const blocks = tokenizeMarkdown("**bold *and em***");
    const block = blocks[0];
    if (block?.kind !== "paragraph") throw new Error("expected paragraph");
    expect(inlineSpansToPlainText(block.children)).toBe("bold and em");
  });

  it("renders links as `text (url)`", () => {
    const blocks = tokenizeMarkdown("[home](https://x.com)");
    const block = blocks[0];
    if (block?.kind !== "paragraph") throw new Error("expected paragraph");
    expect(inlineSpansToPlainText(block.children)).toBe("home (https://x.com)");
  });

  it("returns plain code content (no backticks) — those are added by the renderer", () => {
    const blocks = tokenizeMarkdown("use `foo`.");
    const block = blocks[0];
    if (block?.kind !== "paragraph") throw new Error("expected paragraph");
    expect(inlineSpansToPlainText(block.children)).toBe("use foo.");
  });
});

describe("renderTableToText", () => {
  it("renders header + rows in an ASCII bordered table", () => {
    const blocks = tokenizeMarkdown("| h1 | h2 |\n|---|---|\n| a | b |");
    const block = blocks[0];
    if (block?.kind !== "table") throw new Error("expected table");
    const out = renderTableToText(block.header, block.rows);
    expect(out).toContain("h1");
    expect(out).toContain("h2");
    expect(out).toContain("a");
    expect(out).toContain("b");
    expect(out).toMatch(
      /[\u2500\u2502\u250C\u2510\u2514\u2518\u251C\u2524\u252C\u2534\u253C]/,
    );
  });
});

describe("truncateToLastNLines", () => {
  it("returns the original string when input has fewer lines than N", () => {
    expect(truncateToLastNLines("a\nb", 5)).toBe("a\nb");
  });

  it("returns the last N lines with an ellipsis prepended", () => {
    const out = truncateToLastNLines("1\n2\n3\n4\n5\n6\n7", 3);
    expect(out).toBe(`${THINKING_ELLIPSIS_LINE}\n5\n6\n7`);
  });

  it("normalises CRLF before measuring lines", () => {
    const out = truncateToLastNLines("a\r\nb\r\nc\r\nd\r\ne\r\nf", 3);
    expect(out).toBe(`${THINKING_ELLIPSIS_LINE}\nd\ne\nf`);
  });

  it("returns input unchanged when N < 1", () => {
    expect(truncateToLastNLines("x\ny", 0)).toBe("x\ny");
  });
});

describe("truncateThinking", () => {
  it("uses the 5-line default cap", () => {
    const out = truncateThinking("1\n2\n3\n4\n5\n6\n7");
    expect(out.split("\n")).toEqual([
      THINKING_ELLIPSIS_LINE,
      "3",
      "4",
      "5",
      "6",
      "7",
    ]);
  });

  it("returns a 5-line input unchanged", () => {
    expect(truncateThinking("1\n2\n3\n4\n5")).toBe("1\n2\n3\n4\n5");
  });
});
