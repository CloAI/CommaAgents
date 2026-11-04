import { describe, expect, it } from "vitest";
import {
  MAX_PANES,
  canSplit,
  closePane,
  containsPane,
  createLayout,
  listPanes,
  movePane,
  setActivePane,
  setPanePath,
  setSplitSizes,
  splitPane,
} from "./layout";
import type { Layout, LayoutNode, SplitNode } from "./layout.types";

/**
 * Hand out predictable identifiers.
 * @returns {() => string} An id source producing "n1", "n2", and so on.
 */
function ids(): () => string {
  let next = 0;
  return () => `n${++next}`;
}

/**
 * Describe a tree compactly for assertions.
 * @param {LayoutNode} node - Tree to describe.
 * @returns {string} Panes as ids, splits as r(...) for rows and c(...) for columns.
 */
function shape(node: LayoutNode): string {
  return node.type === "pane"
    ? node.id
    : `${node.direction === "row" ? "r" : "c"}(${node.children.map(shape).join(" ")})`;
}

/**
 * Narrow a node to a split, failing the test otherwise.
 * @param {LayoutNode} node - Node expected to be a split.
 * @returns {SplitNode} The split.
 */
function asSplit(node: LayoutNode): SplitNode {
  if (node.type !== "split") {
    throw new Error("Expected a split.");
  }
  return node;
}

/**
 * Build a layout from a start pane by applying splits.
 * @param {(layout: Layout) => Layout} build - Edits to apply.
 * @returns {Layout} The resulting layout.
 */
function layoutWith(build: (layout: Layout) => Layout): Layout {
  return build({ root: { type: "pane", id: "a", path: "/" }, activeId: "a" });
}

describe("createLayout", () => {
  it("should start with one focused pane showing the route", () => {
    const layout = createLayout("/runs/x", () => "p");
    expect(layout).toEqual({
      root: { type: "pane", id: "p", path: "/runs/x" },
      activeId: "p",
    });
  });
});

describe("splitPane", () => {
  it("should place a new empty chat beside the pane and focus it", () => {
    const id = ids();
    const layout = splitPane(
      layoutWith((l) => l),
      "a",
      "row",
      id,
    );
    expect(shape(layout.root)).toBe("r(a n1)");
    expect(layout.activeId).toBe("n1");
    expect(listPanes(layout.root).find((p) => p.id === "n1")?.path).toBe("/");
  });

  it("should add a sibling instead of nesting when the direction matches", () => {
    const id = ids();
    let layout = splitPane(
      layoutWith((l) => l),
      "a",
      "row",
      id,
    );
    layout = splitPane(layout, "a", "row", id);
    expect(shape(layout.root)).toBe("r(a n3 n1)");
  });

  it("should nest when the direction differs", () => {
    const id = ids();
    let layout = splitPane(
      layoutWith((l) => l),
      "a",
      "row",
      id,
    );
    layout = splitPane(layout, "n1", "column", id);
    expect(shape(layout.root)).toBe("r(a c(n1 n3))");
  });

  it("should drop saved sizes of a split that gains a child", () => {
    const id = ids();
    let layout = splitPane(
      layoutWith((l) => l),
      "a",
      "row",
      id,
    );
    const splitId = asSplit(layout.root).id;
    layout = setSplitSizes(layout, splitId, [300, 700]);
    layout = splitPane(layout, "a", "row", id);
    expect(asSplit(layout.root).sizes).toBeUndefined();
  });

  it("should ignore a missing pane and stop at the pane limit", () => {
    const id = ids();
    let layout = layoutWith((l) => l);
    expect(splitPane(layout, "missing", "row", id)).toBe(layout);
    while (canSplit(layout)) {
      layout = splitPane(layout, layout.activeId, "row", id);
    }
    expect(listPanes(layout.root)).toHaveLength(MAX_PANES);
    expect(splitPane(layout, layout.activeId, "column", id)).toBe(layout);
  });
});

describe("closePane", () => {
  it("should never remove the last pane", () => {
    const layout = layoutWith((l) => l);
    expect(closePane(layout, "a")).toBe(layout);
  });

  it("should collapse a split left with one child", () => {
    const layout = closePane(
      splitPane(
        layoutWith((l) => l),
        "a",
        "row",
        ids(),
      ),
      "n1",
    );
    expect(shape(layout.root)).toBe("a");
  });

  it("should focus a neighbor only when the closed pane had focus", () => {
    const id = ids();
    let layout = splitPane(
      layoutWith((l) => l),
      "a",
      "row",
      id,
    );
    layout = splitPane(layout, "n1", "row", id);
    expect(shape(layout.root)).toBe("r(a n1 n3)");
    expect(layout.activeId).toBe("n3");
    expect(closePane(layout, "n1").activeId).toBe("n3");
    expect(closePane(layout, "n3").activeId).toBe("n1");
    expect(closePane(setActivePane(layout, "a"), "n1").activeId).toBe("a");
  });

  it("should merge a surviving same-direction split into its parent", () => {
    const id = ids();
    let layout = splitPane(
      layoutWith((l) => l),
      "a",
      "row",
      id,
    );
    layout = splitPane(layout, "n1", "column", id);
    layout = splitPane(layout, "n3", "row", id);
    expect(shape(layout.root)).toBe("r(a c(n1 r(n3 n5)))");
    expect(shape(closePane(layout, "n1").root)).toBe("r(a n3 n5)");
  });
});

describe("movePane", () => {
  const grid = (): Layout => {
    const id = ids();
    let layout = splitPane(
      layoutWith((l) => l),
      "a",
      "row",
      id,
    );
    layout = splitPane(layout, "n1", "row", id);
    return layout; // r(a n1 n3)
  };

  it("should dock a pane beside the target on a side edge", () => {
    expect(shape(movePane(grid(), "a", "n3", "right", ids()).root)).toBe(
      "r(n1 n3 a)",
    );
    expect(shape(movePane(grid(), "n3", "a", "left", ids()).root)).toBe(
      "r(n3 a n1)",
    );
  });

  it("should split the target into a column on a top or bottom edge", () => {
    expect(shape(movePane(grid(), "a", "n3", "bottom", ids()).root)).toBe(
      "r(n1 c(n3 a))",
    );
    expect(shape(movePane(grid(), "n1", "a", "top", ids()).root)).toBe(
      "r(c(n1 a) n3)",
    );
  });

  it("should keep every pane when moving", () => {
    const moved = movePane(grid(), "a", "n3", "bottom", ids());
    expect(
      listPanes(moved.root)
        .map((p) => p.id)
        .sort(),
    ).toEqual(["a", "n1", "n3"]);
    expect(moved.activeId).toBe("a");
  });

  it("should ignore moving a pane onto itself or a missing pane", () => {
    const layout = grid();
    expect(movePane(layout, "a", "a", "left")).toBe(layout);
    expect(movePane(layout, "a", "missing", "left")).toBe(layout);
  });
});

describe("pane state", () => {
  it("should change a pane's route and leave an unchanged route alone", () => {
    const layout = layoutWith((l) => l);
    expect(setPanePath(layout, "a", "/")).toBe(layout);
    const changed = setPanePath(layout, "a", "/runs/1");
    expect(listPanes(changed.root)[0]?.path).toBe("/runs/1");
  });

  it("should focus only existing panes", () => {
    const layout = splitPane(
      layoutWith((l) => l),
      "a",
      "row",
      ids(),
    );
    expect(setActivePane(layout, "a").activeId).toBe("a");
    expect(setActivePane(layout, "missing")).toBe(layout);
    expect(containsPane(layout.root, "n1")).toBe(true);
  });

  it("should store only sizes that fit the split", () => {
    const layout = splitPane(
      layoutWith((l) => l),
      "a",
      "row",
      ids(),
    );
    const splitId = asSplit(layout.root).id;
    expect(setSplitSizes(layout, splitId, [1])).toBe(layout);
    expect(setSplitSizes(layout, splitId, [0, 5])).toBe(layout);
    expect(
      asSplit(setSplitSizes(layout, splitId, [200, 300]).root).sizes,
    ).toEqual([200, 300]);
  });
});
