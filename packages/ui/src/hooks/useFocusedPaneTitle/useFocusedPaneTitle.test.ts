import { describe, expect, it } from "vitest";
import { version } from "../../../../../package.json";
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
  it("should use the resolved run name only when a run is focused", () => {
    expect(focusedPaneTitle(layout("b"), "Build project")).toBe(
      `CommaAgents v${version} - Build project`,
    );
    expect(focusedPaneTitle(layout("a"), "Build project")).toBe(
      `CommaAgents v${version}`,
    );
  });
  it("should show the application version and identify a focused run", () => {
    expect(focusedPaneTitle(layout("a"))).toBe(`CommaAgents v${version}`);
    expect(focusedPaneTitle(layout("b"))).toBe(
      `CommaAgents v${version} - Run 12345678`,
    );
  });

  it("should show the application version when the focused pane is missing", () => {
    expect(focusedPaneTitle(layout("missing"))).toBe(`CommaAgents v${version}`);
  });
});
