import { describe, expect, it } from "vitest";
import { focusedPaneTitle } from "./useFocusedPaneTitle";
import type { Layout } from "../useLayout";

const layout = (activeId: string): Layout => ({
  activeId,
  root: {
    type: "split",
    id: "split",
    direction: "row",
    sizes: [1, 1],
    children: [
      { type: "pane", id: "a", path: "/" },
      { type: "pane", id: "b", path: "/runs/12345678-aaaa" },
    ],
  },
});

describe("focusedPaneTitle", () => {
  it("titles the focused pane by its route", () => {
    expect(focusedPaneTitle(layout("a"))).toBe("New chat");
    expect(focusedPaneTitle(layout("b"))).toBe("Run 12345678");
  });

  it("falls back to a new chat when the focused pane is missing", () => {
    expect(focusedPaneTitle(layout("missing"))).toBe("New chat");
  });
});
