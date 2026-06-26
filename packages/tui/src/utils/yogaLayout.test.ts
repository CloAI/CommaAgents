import { describe, expect, it } from "bun:test";
import type { DOMElement } from "ink";
import { getAbsolutePosition, getBoundingBox } from "./yogaLayout";

function createNode(
  top: number,
  left: number,
  width: number,
  height: number,
  parentNode?: DOMElement,
): DOMElement {
  return {
    parentNode,
    yogaNode: {
      getComputedTop: () => top,
      getComputedLeft: () => left,
      getComputedWidth: () => width,
      getComputedHeight: () => height,
    },
  } as unknown as DOMElement;
}

describe("yoga layout helpers", () => {
  it("accumulates parent-relative positions", () => {
    const parent = createNode(2, 3, 20, 10);
    const child = createNode(4, 5, 8, 6, parent);

    expect(getAbsolutePosition(child)).toEqual({ top: 6, left: 8 });
    expect(getBoundingBox(child)).toEqual({
      top: 6,
      left: 8,
      width: 8,
      height: 6,
    });
  });

  it("returns zero dimensions when Yoga data is unavailable", () => {
    const node = { parentNode: undefined } as unknown as DOMElement;

    expect(getBoundingBox(node)).toEqual({
      top: 0,
      left: 0,
      width: 0,
      height: 0,
    });
  });
});
