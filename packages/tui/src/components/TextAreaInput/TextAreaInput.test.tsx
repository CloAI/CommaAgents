import { describe, expect, it } from "bun:test";

import {
  buildIndexCellMap,
  type CursorIntent,
  computeNextCursorState,
} from "./TextAreaInput.utils";

const measureAscii = (text: string): number => text.length;

function callCompute(params: {
  readonly intent: CursorIntent;
  readonly value: string;
  readonly rows: readonly string[];
  readonly currentCursorIndex?: number;
  readonly currentRowDisplayOffset?: number;
  readonly viewportHeight?: number;
}) {
  return computeNextCursorState({
    intent: params.intent,
    value: params.value,
    rows: params.rows,
    currentCursorIndex: params.currentCursorIndex ?? 0,
    currentRowDisplayOffset: params.currentRowDisplayOffset ?? 0,
    viewportHeight: params.viewportHeight ?? 5,
    measureWidth: measureAscii,
  });
}

describe("buildIndexCellMap", () => {
  it("should map every index in a single-line string to a cell on row 0", () => {
    const indexCellMap = buildIndexCellMap("hello", ["hello"], measureAscii);
    expect(indexCellMap).toEqual([
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 2, y: 0 },
      { x: 3, y: 0 },
      { x: 4, y: 0 },
      { x: 5, y: 0 }, // end-of-buffer
    ]);
  });

  it("should account for the newline character occupying its own raw index", () => {
    const indexCellMap = buildIndexCellMap(
      "ab\ncd",
      ["ab", "cd"],
      measureAscii,
    );
    expect(indexCellMap).toEqual([
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 2, y: 0 }, // the '\n' itself
      { x: 0, y: 1 },
      { x: 1, y: 1 },
      { x: 2, y: 1 }, // end-of-buffer
    ]);
  });

  it("should expose an end-of-buffer entry for an empty string", () => {
    const indexCellMap = buildIndexCellMap("", [""], measureAscii);
    expect(indexCellMap).toEqual([{ x: 0, y: 0 }]);
  });
});

describe("computeNextCursorState", () => {
  describe("left arrow", () => {
    it("should step the cursor one column to the left", () => {
      const result = callCompute({
        intent: { kind: "left" },
        value: "hello",
        rows: ["hello"],
        currentCursorIndex: 3,
      });
      expect(result.cursorIndex).toBe(2);
      expect(result.cell).toEqual({ x: 2, y: 0 });
    });

    it("should jump to the end of the previous row across a newline", () => {
      const result = callCompute({
        intent: { kind: "left" },
        value: "abc\nde",
        rows: ["abc", "de"],
        currentCursorIndex: 4, // start of "de"
      });
      expect(result.cursorIndex).toBe(3); // on the '\n'
      expect(result.cell).toEqual({ x: 3, y: 0 });
    });

    it("should stay put at the start of the buffer", () => {
      const result = callCompute({
        intent: { kind: "left" },
        value: "abc",
        rows: ["abc"],
        currentCursorIndex: 0,
      });
      expect(result.cursorIndex).toBe(0);
      expect(result.cell).toEqual({ x: 0, y: 0 });
    });
  });

  describe("right arrow", () => {
    it("should step the cursor one column to the right", () => {
      const result = callCompute({
        intent: { kind: "right" },
        value: "hello",
        rows: ["hello"],
        currentCursorIndex: 2,
      });
      expect(result.cursorIndex).toBe(3);
      expect(result.cell).toEqual({ x: 3, y: 0 });
    });

    it("should wrap to the next row across a newline", () => {
      const result = callCompute({
        intent: { kind: "right" },
        value: "abc\nde",
        rows: ["abc", "de"],
        currentCursorIndex: 3, // on the '\n'
      });
      expect(result.cursorIndex).toBe(4);
      expect(result.cell).toEqual({ x: 0, y: 1 });
    });

    it("should stay put at the end of the buffer", () => {
      const result = callCompute({
        intent: { kind: "right" },
        value: "abc",
        rows: ["abc"],
        currentCursorIndex: 3,
      });
      expect(result.cursorIndex).toBe(3);
      expect(result.cell).toEqual({ x: 3, y: 0 });
    });
  });

  describe("up/down arrows", () => {
    it("should preserve column on up arrow", () => {
      const result = callCompute({
        intent: { kind: "up" },
        value: "abcdef\nabcdef",
        rows: ["abcdef", "abcdef"],
        currentCursorIndex: 11, // x=4, y=1
      });
      expect(result.cell).toEqual({ x: 4, y: 0 });
      expect(result.cursorIndex).toBe(4);
    });

    it("should clamp column to row width when target row is shorter", () => {
      const result = callCompute({
        intent: { kind: "up" },
        value: "ab\nabcdef",
        rows: ["ab", "abcdef"],
        currentCursorIndex: 8, // x=5, y=1
      });
      expect(result.cell).toEqual({ x: 2, y: 0 });
      expect(result.cursorIndex).toBe(2);
    });

    it("should not move past the first row", () => {
      const result = callCompute({
        intent: { kind: "up" },
        value: "abc",
        rows: ["abc"],
        currentCursorIndex: 1,
      });
      expect(result.cursorIndex).toBe(1);
      expect(result.cell).toEqual({ x: 1, y: 0 });
    });

    it("should not move past the last row on down arrow", () => {
      const result = callCompute({
        intent: { kind: "down" },
        value: "abc\ndef",
        rows: ["abc", "def"],
        currentCursorIndex: 5, // x=1, y=1
      });
      expect(result.cursorIndex).toBe(5);
      expect(result.cell).toEqual({ x: 1, y: 1 });
    });
  });

  describe("snapToCursor", () => {
    it("should re-derive the cell from the current index without moving it", () => {
      const result = callCompute({
        intent: { kind: "snapToCursor" },
        value: "hello\n",
        rows: ["hello", ""],
        currentCursorIndex: 6, // after the '\n'
      });
      expect(result.cursorIndex).toBe(6);
      expect(result.cell).toEqual({ x: 0, y: 1 });
    });

    it("should advance the scroll offset when the cursor overflows the viewport", () => {
      const result = callCompute({
        intent: { kind: "snapToCursor" },
        value: "a\nb\nc\nd\ne\n",
        rows: ["a", "b", "c", "d", "e", ""],
        currentCursorIndex: 10, // end-of-buffer (y=5)
        currentRowDisplayOffset: 0,
        viewportHeight: 5,
      });
      expect(result.cell).toEqual({ x: 0, y: 5 });
      expect(result.rowDisplayOffset).toBe(1);
    });

    it("should clamp the index to value.length when overshooting", () => {
      const result = callCompute({
        intent: { kind: "snapToCursor" },
        value: "abc",
        rows: ["abc"],
        currentCursorIndex: 99,
      });
      expect(result.cursorIndex).toBe(3);
      expect(result.cell).toEqual({ x: 3, y: 0 });
    });

    it("should reset to origin when value is empty", () => {
      const result = callCompute({
        intent: { kind: "snapToCursor" },
        value: "",
        rows: [""],
        currentCursorIndex: 5,
      });
      expect(result.cursorIndex).toBe(0);
      expect(result.cell).toEqual({ x: 0, y: 0 });
      expect(result.rowDisplayOffset).toBe(0);
    });

    it("should pull the scroll offset back when rows shrank below the window", () => {
      const result = callCompute({
        intent: { kind: "snapToCursor" },
        value: "0\n1\n2\n3\n4\n5\n6",
        rows: ["0", "1", "2", "3", "4", "5", "6"],
        currentCursorIndex: 13, // end-of-buffer, y=6
        currentRowDisplayOffset: 3,
        viewportHeight: 5,
      });
      expect(result.cell).toEqual({ x: 1, y: 6 });
      expect(result.rowDisplayOffset).toBe(2);
    });
  });

  describe("scroll offset clamping", () => {
    it("should never produce a negative offset", () => {
      const result = callCompute({
        intent: { kind: "up" },
        value: "a\nb",
        rows: ["a", "b"],
        currentCursorIndex: 2, // y=1
        currentRowDisplayOffset: 0,
        viewportHeight: 5,
      });
      expect(result.rowDisplayOffset).toBe(0);
    });

    it("should never push the offset past totalRows - viewportHeight", () => {
      const result = callCompute({
        intent: { kind: "down" },
        value: "0\n1\n2\n3\n4\n5",
        rows: ["0", "1", "2", "3", "4", "5"],
        currentCursorIndex: 8, // x=0, y=4
        currentRowDisplayOffset: 0,
        viewportHeight: 5,
      });
      expect(result.cell).toEqual({ x: 0, y: 5 });
      expect(result.rowDisplayOffset).toBe(1);
    });

    it("should keep the existing offset when the cursor is already visible", () => {
      const result = callCompute({
        intent: { kind: "right" },
        value: "abcdef\nghi",
        rows: ["abcdef", "ghi"],
        currentCursorIndex: 8, // x=1, y=1
        currentRowDisplayOffset: 0,
        viewportHeight: 5,
      });
      expect(result.rowDisplayOffset).toBe(0);
    });

    it("should return offset 0 when viewportHeight is 0", () => {
      const result = callCompute({
        intent: { kind: "down" },
        value: "a\nb\nc",
        rows: ["a", "b", "c"],
        currentCursorIndex: 0,
        currentRowDisplayOffset: 0,
        viewportHeight: 0,
      });
      expect(result.rowDisplayOffset).toBe(0);
    });
  });
});
