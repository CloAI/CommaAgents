import { describe, expect, it } from "bun:test";
import { render } from "ink-testing-library";

import { MarkdownViewRender } from "./MarkdownView";
import {
  BLOCKQUOTE_PREFIX,
  HEADING_PREFIX_CHAR,
  HORIZONTAL_RULE_CHAR,
  UNORDERED_LIST_BULLET,
} from "./MarkdownView.constants";
import type { MarkdownViewTheme } from "./MarkdownView.theme";
import type { MdBlock, MdInline } from "./MarkdownView.types";

/**
 * Stub theme avoiding any colour escapes so frame assertions can match
 * raw glyphs. Mirrors the `ToolCallView` test pattern.
 */
const TEST_THEME: MarkdownViewTheme = {
  root: { flexDirection: "column" },
  paragraph: { flexDirection: "column" },
  listItemRow: { flexDirection: "row" },
  listMarker: { color: "", bold: false },
  listItemContent: { flexDirection: "column" },
  blockquote: { flexDirection: "column" },
  blockquoteMarker: { color: "", dimColor: false },
  heading: { bold: false, color: "" },
  headingPrefix: { dimColor: false, color: "" },
  inlineCode: { color: "" },
  linkText: { color: "", underline: true },
  linkUrl: { color: "", dimColor: false },
  strong: { bold: true },
  em: { italic: true },
  horizontalRule: { flexDirection: "row" },
  horizontalRuleText: { dimColor: false, color: "" },
  table: { flexDirection: "column" },
  tableText: { color: "" },
  paragraphText: { wrap: "wrap" },
};

const text = (value: string): MdInline => ({ kind: "text", value });

const renderBlocks = (blocks: readonly MdBlock[], width = 40): string => {
  const { lastFrame } = render(
    <MarkdownViewRender blocks={blocks} theme={TEST_THEME} width={width} />,
  );
  return lastFrame() ?? "";
};

describe("MarkdownViewRender", () => {
  describe("paragraph block", () => {
    it("renders inline text verbatim", () => {
      const frame = renderBlocks([
        { kind: "paragraph", children: [text("hello world")] },
      ]);
      expect(frame).toContain("hello world");
    });

    it("flattens nested strong/em/code spans into the run", () => {
      const frame = renderBlocks([
        {
          kind: "paragraph",
          children: [
            { kind: "strong", children: [text("bold")] },
            text(" and "),
            { kind: "em", children: [text("em")] },
            text(" "),
            { kind: "code", value: "x" },
          ],
        },
      ]);
      expect(frame).toContain("bold");
      expect(frame).toContain("em");
      // Inline code wraps in literal backticks.
      expect(frame).toContain("`x`");
    });
  });

  describe("heading block", () => {
    it("prefixes depth=1 headings with a single `#`", () => {
      const frame = renderBlocks([
        { kind: "heading", depth: 1, children: [text("Title")] },
      ]);
      expect(frame).toContain(`${HEADING_PREFIX_CHAR} Title`);
    });

    it("prefixes depth=3 headings with `### `", () => {
      const frame = renderBlocks([
        { kind: "heading", depth: 3, children: [text("Sub")] },
      ]);
      expect(frame).toContain(`${HEADING_PREFIX_CHAR.repeat(3)} Sub`);
    });

    it("prefixes depth=6 headings with `###### `", () => {
      const frame = renderBlocks([
        { kind: "heading", depth: 6, children: [text("Deep")] },
      ]);
      expect(frame).toContain(`${HEADING_PREFIX_CHAR.repeat(6)} Deep`);
    });
  });

  describe("list block", () => {
    it("renders unordered items with the bullet glyph", () => {
      const frame = renderBlocks([
        {
          kind: "list",
          ordered: false,
          start: 1,
          items: [
            { children: [text("first")], nested: [] },
            { children: [text("second")], nested: [] },
          ],
        },
      ]);
      expect(frame).toContain(`${UNORDERED_LIST_BULLET} first`);
      expect(frame).toContain(`${UNORDERED_LIST_BULLET} second`);
    });

    it("renders ordered items starting at the supplied `start` value", () => {
      const frame = renderBlocks([
        {
          kind: "list",
          ordered: true,
          start: 3,
          items: [
            { children: [text("alpha")], nested: [] },
            { children: [text("beta")], nested: [] },
          ],
        },
      ]);
      expect(frame).toContain("3. alpha");
      expect(frame).toContain("4. beta");
    });

    it("right-pads single-digit ordinals so two-digit ordinals align", () => {
      // start=9 + 2 items => `9.` and `10.` need same column. The
      // single-digit one should be space-padded to width 3.
      const items = Array.from({ length: 2 }, (_, i) => ({
        children: [text(`item ${i}`)],
        nested: [] as readonly MdBlock[],
      }));
      const frame = renderBlocks([
        { kind: "list", ordered: true, start: 9, items },
      ]);
      expect(frame).toContain(" 9. item 0");
      expect(frame).toContain("10. item 1");
    });

    it("renders nested lists indented under their parent item", () => {
      const frame = renderBlocks([
        {
          kind: "list",
          ordered: false,
          start: 1,
          items: [
            {
              children: [text("outer")],
              nested: [
                {
                  kind: "list",
                  ordered: false,
                  start: 1,
                  items: [{ children: [text("inner")], nested: [] }],
                },
              ],
            },
          ],
        },
      ]);
      expect(frame).toContain(`${UNORDERED_LIST_BULLET} outer`);
      expect(frame).toContain(`${UNORDERED_LIST_BULLET} inner`);
      // Nested bullet should be right of outer bullet on its line.
      const innerLine =
        frame.split("\n").find((l) => l.includes("inner")) ?? "";
      const outerCol = innerLine.indexOf(UNORDERED_LIST_BULLET);
      expect(outerCol).toBeGreaterThan(0);
    });
  });

  describe("blockquote block", () => {
    it("prefixes every paragraph line with the blockquote marker", () => {
      const frame = renderBlocks([
        {
          kind: "blockquote",
          children: [{ kind: "paragraph", children: [text("quoted line")] }],
        },
      ]);
      expect(frame).toContain(`${BLOCKQUOTE_PREFIX}quoted line`);
    });
  });

  describe("code block", () => {
    it("renders the source text of the fence (known language)", () => {
      const frame = renderBlocks([
        { kind: "code", value: "const x = 1;", language: "ts" },
      ]);
      expect(frame).toContain("const x = 1;");
    });

    it("renders unknown languages as plain text without crashing", () => {
      const frame = renderBlocks([
        {
          kind: "code",
          value: "definitely not real code",
          language: "not-a-real-lang",
        },
      ]);
      expect(frame).toContain("definitely not real code");
    });
  });

  describe("table block", () => {
    it("renders header and row cells", () => {
      const frame = renderBlocks([
        {
          kind: "table",
          header: [[text("Col A")], [text("Col B")]],
          rows: [[[text("a1")], [text("b1")]]],
        },
      ]);
      expect(frame).toContain("Col A");
      expect(frame).toContain("Col B");
      expect(frame).toContain("a1");
      expect(frame).toContain("b1");
    });
  });

  describe("horizontal rule block", () => {
    it("repeats the rule glyph up to the supplied width", () => {
      const frame = renderBlocks([{ kind: "hr" }], 10);
      expect(frame).toContain(HORIZONTAL_RULE_CHAR.repeat(10));
    });

    it("falls back to one glyph when width is zero", () => {
      const frame = renderBlocks([{ kind: "hr" }], 0);
      expect(frame).toContain(HORIZONTAL_RULE_CHAR);
    });
  });

  describe("inline link span", () => {
    it("renders link text followed by `(url)`", () => {
      const frame = renderBlocks([
        {
          kind: "paragraph",
          children: [
            { kind: "link", text: "site", href: "https://example.com" },
          ],
        },
      ]);
      expect(frame).toContain("site");
      expect(frame).toContain("(https://example.com)");
    });

    it("omits the parenthetical when href is empty", () => {
      const frame = renderBlocks([
        {
          kind: "paragraph",
          children: [{ kind: "link", text: "bare", href: "" }],
        },
      ]);
      expect(frame).toContain("bare");
      expect(frame).not.toContain("()");
    });
  });

  describe("multi-block document snapshot", () => {
    it("renders heading, paragraph, list, and hr stacked in order", () => {
      const frame = renderBlocks(
        [
          { kind: "heading", depth: 2, children: [text("Title")] },
          { kind: "paragraph", children: [text("intro paragraph")] },
          {
            kind: "list",
            ordered: false,
            start: 1,
            items: [
              { children: [text("one")], nested: [] },
              { children: [text("two")], nested: [] },
            ],
          },
          { kind: "hr" },
        ],
        20,
      );

      const lines = frame.split("\n");
      const titleIdx = lines.findIndex((l) => l.includes("## Title"));
      const introIdx = lines.findIndex((l) => l.includes("intro paragraph"));
      const oneIdx = lines.findIndex((l) =>
        l.includes(`${UNORDERED_LIST_BULLET} one`),
      );
      const hrIdx = lines.findIndex((l) =>
        l.includes(HORIZONTAL_RULE_CHAR.repeat(20)),
      );

      expect(titleIdx).toBeGreaterThanOrEqual(0);
      expect(introIdx).toBeGreaterThan(titleIdx);
      expect(oneIdx).toBeGreaterThan(introIdx);
      expect(hrIdx).toBeGreaterThan(oneIdx);
    });
  });

  describe("snapshots", () => {
    it("paragraph with mixed inline spans", () => {
      const frame = renderBlocks([
        {
          kind: "paragraph",
          children: [
            { kind: "strong", children: [text("bold")] },
            text(" "),
            { kind: "em", children: [text("em")] },
            text(" "),
            { kind: "code", value: "code" },
          ],
        },
      ]);
      expect(frame).toMatchSnapshot();
    });

    it("heading depths 1..6", () => {
      const blocks: readonly MdBlock[] = ([1, 2, 3, 4, 5, 6] as const).map(
        (depth) => ({
          kind: "heading" as const,
          depth,
          children: [text(`h${depth}`)],
        }),
      );
      expect(renderBlocks(blocks)).toMatchSnapshot();
    });

    it("ordered list with two-digit ordinal alignment", () => {
      const items = Array.from({ length: 3 }, (_, i) => ({
        children: [text(`item ${i}`)],
        nested: [] as readonly MdBlock[],
      }));
      const frame = renderBlocks([
        { kind: "list", ordered: true, start: 9, items },
      ]);
      expect(frame).toMatchSnapshot();
    });

    it("nested unordered list", () => {
      const frame = renderBlocks([
        {
          kind: "list",
          ordered: false,
          start: 1,
          items: [
            {
              children: [text("outer a")],
              nested: [
                {
                  kind: "list",
                  ordered: false,
                  start: 1,
                  items: [
                    { children: [text("inner a")], nested: [] },
                    { children: [text("inner b")], nested: [] },
                  ],
                },
              ],
            },
            { children: [text("outer b")], nested: [] },
          ],
        },
      ]);
      expect(frame).toMatchSnapshot();
    });

    it("blockquote with two paragraph lines", () => {
      const frame = renderBlocks([
        {
          kind: "blockquote",
          children: [
            {
              kind: "paragraph",
              children: [text("first quoted line\nsecond quoted line")],
            },
          ],
        },
      ]);
      expect(frame).toMatchSnapshot();
    });

    it("horizontal rule at width 20", () => {
      const frame = renderBlocks([{ kind: "hr" }], 20);
      expect(frame).toMatchSnapshot();
    });

    it("table with header and two rows", () => {
      const frame = renderBlocks([
        {
          kind: "table",
          header: [[text("Name")], [text("Role")]],
          rows: [
            [[text("alice")], [text("planner")]],
            [[text("bob")], [text("builder")]],
          ],
        },
      ]);
      expect(frame).toMatchSnapshot();
    });

    it("link inline span with href", () => {
      const frame = renderBlocks([
        {
          kind: "paragraph",
          children: [
            text("see "),
            { kind: "link", text: "docs", href: "https://example.com" },
          ],
        },
      ]);
      expect(frame).toMatchSnapshot();
    });

    it("multi-block document (heading + paragraph + list + hr)", () => {
      const frame = renderBlocks(
        [
          { kind: "heading", depth: 2, children: [text("Title")] },
          { kind: "paragraph", children: [text("intro paragraph")] },
          {
            kind: "list",
            ordered: false,
            start: 1,
            items: [
              { children: [text("one")], nested: [] },
              { children: [text("two")], nested: [] },
            ],
          },
          { kind: "hr" },
        ],
        20,
      );
      expect(frame).toMatchSnapshot();
    });
  });
});
