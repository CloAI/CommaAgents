import { describe, expect, it } from "vitest";
import { MAX_PANES, splitPane } from "./layout";
import { parseLayout, serializeLayout } from "./layout.storage";
import type { Layout, LayoutNode, SplitNode } from "./layout.types";

/**
 * Read a split's sizes.
 * @param {LayoutNode | undefined} node - Parsed root.
 * @returns {readonly number[] | undefined} The saved sizes, if the node is a split with any.
 */
function sizesOf(node: LayoutNode | undefined): SplitNode["sizes"] {
  return node?.type === "split" ? node.sizes : undefined;
}

const start: Layout = {
  root: { type: "pane", id: "a", path: "/" },
  activeId: "a",
};

describe("layout storage", () => {
  it("should round-trip a layout", () => {
    let n = 0;
    const layout = splitPane(start, "a", "column", () => `n${++n}`);
    expect(parseLayout(serializeLayout(layout))).toEqual(layout);
  });

  it("should keep valid sizes and drop ones that do not fit", () => {
    const split = (sizes: unknown) =>
      JSON.stringify({
        version: 1,
        activeId: "a",
        root: {
          type: "split",
          id: "s",
          direction: "row",
          sizes,
          children: [
            { type: "pane", id: "a", path: "/" },
            { type: "pane", id: "b", path: "/runs/1" },
          ],
        },
      });
    expect(sizesOf(parseLayout(split([1, 2]))?.root)).toEqual([1, 2]);
    expect(sizesOf(parseLayout(split([1]))?.root)).toBeUndefined();
    expect(sizesOf(parseLayout(split([1, -2]))?.root)).toBeUndefined();
  });

  it("should fall back to the first pane when the focused pane is gone", () => {
    const text = JSON.stringify({
      version: 1,
      activeId: "ghost",
      root: { type: "pane", id: "a", path: "/" },
    });
    expect(parseLayout(text)?.activeId).toBe("a");
  });

  it("should reject anything malformed or unsupported", () => {
    const pane = { type: "pane", id: "a", path: "/" };
    for (const text of [
      "not json",
      "[]",
      JSON.stringify({ version: 2, activeId: "a", root: pane }),
      JSON.stringify({ version: 1, activeId: "a" }),
      JSON.stringify({
        version: 1,
        activeId: "a",
        root: { ...pane, path: "runs" },
      }),
      JSON.stringify({
        version: 1,
        activeId: "a",
        root: { type: "split", id: "s", direction: "row", children: [pane] },
      }),
      JSON.stringify({
        version: 1,
        activeId: "a",
        root: {
          type: "split",
          id: "s",
          direction: "row",
          children: [pane, pane],
        },
      }),
    ]) {
      expect(parseLayout(text)).toBeUndefined();
    }
  });

  it("should reject a layout with more panes than allowed", () => {
    let n = 0;
    let layout = start;
    for (let i = 0; i < MAX_PANES - 1; i++) {
      layout = splitPane(layout, layout.activeId, "row", () => `n${++n}`);
    }
    expect(parseLayout(serializeLayout(layout))).toBeDefined();
    const panes = Array.from({ length: MAX_PANES + 1 }, (_, index) => ({
      type: "pane",
      id: `p${index}`,
      path: "/",
    }));
    const tooMany = JSON.stringify({
      version: 1,
      activeId: "p0",
      root: { type: "split", id: "s", direction: "row", children: panes },
    });
    expect(parseLayout(tooMany)).toBeUndefined();
  });
});
