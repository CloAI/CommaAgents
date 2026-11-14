import { describe, expect, it } from "vitest";
import { layoutReducer } from "./useLayout.reducer";
import { listPanes } from "./layout";
import type { LayoutState } from "./useLayout.types";

const state: LayoutState = {
  layout: {
    root: {
      type: "split",
      id: "split",
      direction: "row",
      sizes: [30, 70],
      children: [
        { type: "pane", id: "other", path: "/runs/other" },
        { type: "pane", id: "active", path: "/runs/active" },
      ],
    },
    activeId: "active",
  },
  strategyChoices: { active: "old-strategy", other: "keep-strategy" },
  maximizedId: "active",
};
describe("stable pane collections", () => {
  it("should start a new chat in the same pane while retaining its history, strategy and arrangement", () => {
    const result = layoutReducer(state, { type: "newChat", id: "unused" });
    expect(result.layout).toEqual({
      ...state.layout,
      root: {
        ...state.layout.root,
        children: [
          { type: "pane", id: "other", path: "/runs/other" },
          { type: "pane", id: "active", path: "/" },
        ],
      },
    });
    expect(result.paneCollections?.active?.chatIds).toEqual(["active"]);
    expect(result.strategyChoices).toEqual(state.strategyChoices);
    expect(result.maximizedId).toBe("active");
  });
  it("should retain earlier chats when selecting another run", () => {
    const first = layoutReducer(state, {
      type: "path",
      id: "active",
      path: "/runs/one",
    });
    const second = layoutReducer(first, {
      type: "path",
      id: "active",
      path: "/runs/two",
    });
    expect(second.paneCollections?.active).toEqual({
      paneId: "active",
      chatIds: ["one", "two"],
      selectedChatId: "two",
      closed: false,
    });
    expect(
      layoutReducer(second, { type: "path", id: "active", path: "/runs/two" }),
    ).toBe(second);
  });
  it("should reopen a closed pane with its original identity without replacing the other pane", () => {
    const registered = layoutReducer(state, {
      type: "path",
      id: "active",
      path: "/runs/active",
    });
    const closed = layoutReducer(registered, { type: "close", id: "active" });
    expect(closed.paneCollections?.active?.closed).toBe(true);
    expect(closed.strategyChoices.active).toBe("old-strategy");
    const restored = layoutReducer(closed, {
      type: "restore",
      paneId: "active",
      runId: "active",
    });
    expect(listPanes(restored.layout.root)).toEqual([
      { type: "pane", id: "other", path: "/runs/other" },
      { type: "pane", id: "active", path: "/runs/active" },
    ]);
    expect(restored.paneCollections?.active?.closed).toBe(false);
  });
  it("should create a pane when every existing pane is detached", () => {
    const empty: LayoutState = {
      layout: {
        root: { type: "split", id: "empty", direction: "row", children: [] },
        activeId: "",
      },
      strategyChoices: {},
    };
    expect(
      listPanes(
        layoutReducer(empty, { type: "newChat", id: "fresh" }).layout.root,
      ),
    ).toEqual([{ type: "pane", id: "fresh", path: "/" }]);
  });
});
