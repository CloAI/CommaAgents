import { describe, expect, it } from "vitest";
import { layoutReducer } from "./useLayout.reducer";
import type { LayoutState } from "./useLayout.types";

describe("new chat", () => {
  it("replaces the active pane while preserving siblings, split sizes and maximization", () => {
    const sibling = { type: "pane", id: "other", path: "/runs/other" } as const;
    const state: LayoutState = {
      layout: {
        root: {
          type: "split",
          id: "split",
          direction: "row",
          sizes: [30, 70],
          children: [
            sibling,
            { type: "pane", id: "active", path: "/runs/active" },
          ],
        },
        activeId: "active",
      },
      strategyChoices: { active: "old-strategy", other: "keep-strategy" },
      maximizedId: "active",
    };
    const result = layoutReducer(state, { type: "newChat", id: "fresh" });
    expect(result.layout).toEqual({
      root: {
        ...state.layout.root,
        children: [sibling, { type: "pane", id: "fresh", path: "/" }],
      },
      activeId: "fresh",
    });
    if (result.layout.root.type === "split") {
      expect(result.layout.root.children[0]).toBe(sibling);
    }
    expect(result.maximizedId).toBe("fresh");
    expect(result.strategyChoices).toEqual({ other: "keep-strategy" });
  });

  it("replaces a sole pane even when it already shows a new chat", () => {
    const result = layoutReducer(
      {
        layout: {
          root: { type: "pane", id: "old", path: "/" },
          activeId: "old",
        },
        strategyChoices: {},
      },
      { type: "newChat", id: "fresh" },
    );
    expect(result.layout).toEqual({
      root: { type: "pane", id: "fresh", path: "/" },
      activeId: "fresh",
    });
  });
});
