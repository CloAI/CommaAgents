import { describe, expect, it } from "bun:test";
import type { DOMElement } from "ink";
import {
  buildLabelLine,
  buildPill,
  clearHighlight,
  clearLabelLine,
  detectReasons,
  filterReasons,
  labelLineVisibleWidth,
  mergeBackgroundColors,
  mergeLabelColors,
  paintHighlight,
} from "./useDebugRender.utils";

describe("useDebugRender utils", () => {
  it("builds ANSI labels with predictable visible width", () => {
    const colors = mergeLabelColors({ props: "<props>" });
    const line = buildLabelLine("Widget", 3, ["props", "rerender"], colors);

    expect(buildPill("props", "<props>")).toContain("props");
    expect(line).toContain("Widget #3");
    expect(line).toContain("props");
    expect(labelLineVisibleWidth("Widget", 3, ["props", "rerender"])).toBe(33);
  });

  it("detects mount, prop, state, and context reasons", () => {
    expect(detectReasons(false, undefined, undefined)).toEqual([
      "mount",
      "rerender",
    ]);
    expect(detectReasons(true, { value: 2 }, { value: 1 })).toEqual([
      "props",
      "rerender",
    ]);
    expect(detectReasons(true, { value: 1 }, { value: 1 })).toEqual([
      "state",
      "rerender",
    ]);
    expect(detectReasons(true, undefined, undefined)).toEqual([
      "context",
      "rerender",
    ]);
  });

  it("filters reasons and merges color overrides", () => {
    expect(filterReasons(["props", "rerender"], { rerender: false })).toEqual([
      "props",
    ]);
    expect(filterReasons(["props"])).toEqual(["props"]);
    expect(mergeBackgroundColors({ props: "<background>" }).props).toBe(
      "<background>",
    );
    expect(mergeLabelColors({ props: "<label>" }).props).toBe("<label>");
  });

  it("paints and clears labels and borders against Yoga geometry", () => {
    const writes: string[] = [];
    const stdout = {
      write(value: string) {
        writes.push(value);
        return true;
      },
    } as unknown as NodeJS.WriteStream;
    const node = {
      parentNode: undefined,
      yogaNode: {
        getComputedTop: () => 1,
        getComputedLeft: () => 2,
        getComputedWidth: () => 6,
        getComputedHeight: () => 3,
      },
    } as unknown as DOMElement;

    paintHighlight(
      stdout,
      node,
      ["props"],
      "Widget",
      mergeBackgroundColors(),
      true,
    );
    clearLabelLine(stdout, node, 6);
    clearHighlight(stdout, node);

    expect(writes).toHaveLength(3);
    expect(writes[0]).toContain("Widget");
    expect(writes[0]).toContain("┌");
    expect(writes[1]).toContain(" ".repeat(6));
    expect(writes[2]).toContain(" ".repeat(6));
  });

  it("skips painting when geometry has no area", () => {
    const writes: string[] = [];
    const stdout = {
      write(value: string) {
        writes.push(value);
        return true;
      },
    } as unknown as NodeJS.WriteStream;
    const node = {
      parentNode: undefined,
      yogaNode: {
        getComputedTop: () => 0,
        getComputedLeft: () => 0,
        getComputedWidth: () => 0,
        getComputedHeight: () => 0,
      },
    } as unknown as DOMElement;

    paintHighlight(
      stdout,
      node,
      ["rerender"],
      "Widget",
      mergeBackgroundColors(),
      false,
    );
    clearHighlight(stdout, node);

    expect(writes).toEqual([]);
  });
});
