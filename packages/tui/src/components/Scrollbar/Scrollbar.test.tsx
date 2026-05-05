import { render } from "ink-testing-library";
import { describe, expect, it } from "bun:test";

import { ScrollbarRender } from "./Scrollbar";
import type { ScrollbarTheme } from "./Scrollbar.theme";
import { computeScrollbarGeometry } from "./Scrollbar.utils";

const TEST_THEME: ScrollbarTheme = {
  thumbColor: "cyan",
  trackColor: "gray",
  thumbChar: "#",
  trackChar: ".",
};

describe("computeScrollbarGeometry", () => {
  it("should return a zero-height geometry for height=0", () => {
    expect(
      computeScrollbarGeometry({ total: 10, windowSize: 5, offset: 0, height: 0 }),
    ).toEqual({ height: 0, thumbTop: 0, thumbHeight: 0 });
  });

  it("should fill the track when content fits (total <= windowSize)", () => {
    expect(
      computeScrollbarGeometry({ total: 5, windowSize: 10, offset: 0, height: 10 }),
    ).toEqual({ height: 10, thumbTop: 0, thumbHeight: 10 });
    expect(
      computeScrollbarGeometry({ total: 10, windowSize: 10, offset: 0, height: 10 }),
    ).toEqual({ height: 10, thumbTop: 0, thumbHeight: 10 });
  });

  it("should size the thumb proportionally to the visible fraction", () => {
    // 50% visible => thumb half the height.
    const geometry = computeScrollbarGeometry({
      total: 20,
      windowSize: 10,
      offset: 0,
      height: 10,
    });
    expect(geometry.thumbHeight).toBe(5);
    expect(geometry.thumbTop).toBe(0);
  });

  it("should enforce a minimum thumb height of 1", () => {
    const geometry = computeScrollbarGeometry({
      total: 1000,
      windowSize: 1,
      offset: 0,
      height: 10,
    });
    expect(geometry.thumbHeight).toBe(1);
  });

  it("should place the thumb at the bottom when scrolled to the end", () => {
    const geometry = computeScrollbarGeometry({
      total: 20,
      windowSize: 10,
      offset: 10,
      height: 10,
    });
    expect(geometry.thumbTop + geometry.thumbHeight).toBe(10);
  });

  it("should clamp the offset when it exceeds maxOffset", () => {
    const geometry = computeScrollbarGeometry({
      total: 20,
      windowSize: 10,
      offset: 999,
      height: 10,
    });
    expect(geometry.thumbTop + geometry.thumbHeight).toBe(10);
  });

  it("should clamp a negative offset to zero", () => {
    const geometry = computeScrollbarGeometry({
      total: 20,
      windowSize: 10,
      offset: -5,
      height: 10,
    });
    expect(geometry.thumbTop).toBe(0);
  });
});

describe("ScrollbarRender", () => {
  it("should render `height` rows of thumb/track characters", () => {
    const result = render(
      <ScrollbarRender theme={TEST_THEME} height={5} thumbTop={1} thumbHeight={2} />,
    );
    const frame = result.lastFrame() ?? "";
    // Expect 5 rows: track, thumb, thumb, track, track.
    const rows = frame.split("\n");
    expect(rows).toHaveLength(5);
    expect(rows[0]).toContain(".");
    expect(rows[1]).toContain("#");
    expect(rows[2]).toContain("#");
    expect(rows[3]).toContain(".");
    expect(rows[4]).toContain(".");
    result.cleanup();
  });

  it("should render an all-thumb column when thumbHeight === height", () => {
    const result = render(
      <ScrollbarRender theme={TEST_THEME} height={3} thumbTop={0} thumbHeight={3} />,
    );
    const frame = result.lastFrame() ?? "";
    const rows = frame.split("\n");
    expect(rows).toHaveLength(3);
    for (const row of rows) {
      expect(row).toContain("#");
      expect(row.includes(".")).toBe(false);
    }
    result.cleanup();
  });
});
