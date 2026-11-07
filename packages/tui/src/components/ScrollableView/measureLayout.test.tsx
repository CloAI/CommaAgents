import { describe, expect, it } from "vitest";
import { Box, measureLayout, renderToString, Text } from "ink";
import { useLayoutEffect, useState } from "react";

/**
 * Sanity tests for the patched `measureLayout` helper. These exercise
 * `node_modules/ink` directly — they are colocated under
 * `ScrollableView/` because the helper exists in service of the view's
 * virtualization story, not because it lives there.
 */
describe("measureLayout", () => {
  it("returns the constrained width and the natural height of a single Text", () => {
    const result = measureLayout(<Text>hello</Text>, { width: 40 });
    // Width matches the root constraint (`<Text>` grows to fill).
    expect(result.width).toBe(40);
    // Five-character single-line text occupies one row.
    expect(result.height).toBe(1);
  });

  it("returns the natural row count when wrapping at a narrow width", () => {
    const result = measureLayout(<Text>{"x".repeat(30)}</Text>, { width: 10 });
    expect(result.width).toBe(10);
    expect(result.height).toBe(3);
  });

  it("sums child rows for a column-flex Box", () => {
    const result = measureLayout(
      <Box flexDirection="column">
        <Text>one</Text>
        <Text>two</Text>
        <Text>three</Text>
      </Box>,
      { width: 40 },
    );
    expect(result.height).toBe(3);
  });

  it("returns zero height for an empty tree", () => {
    const result = measureLayout(<Box flexDirection="column" />, { width: 20 });
    expect(result.width).toBe(20);
    expect(result.height).toBe(0);
  });

  it("does not leak yoga memory across many calls", () => {
    // The patched helper frees its detached yoga tree on each call.
    // We don't have direct access to a leak counter, but a tight loop
    // mirroring the worst case (per-row measurement in a virtualized
    // list) should complete without throwing and stay snappy.
    for (let i = 0; i < 500; i += 1) {
      const result = measureLayout(
        <Box flexDirection="column">
          <Text>{`row ${i}`}</Text>
        </Box>,
        { width: 30 },
      );
      expect(result.height).toBe(1);
    }
  });

  it("respects an explicit width on a child Box", () => {
    const result = measureLayout(
      <Box width={5}>
        <Text>abcdefghij</Text>
      </Box>,
      { width: 80 },
    );
    // Root box still fills the constraint, but the inner box wraps the
    // text at 5 columns, producing a 2-row natural height.
    expect(result.width).toBe(80);
    expect(result.height).toBe(2);
  });

  it("should respect an explicit height constraint", () => {
    expect(measureLayout(<Text>hello</Text>, { width: 20, height: 5 })).toEqual(
      {
        width: 20,
        height: 5,
      },
    );
  });

  it("should propagate render errors and allow subsequent measurements", () => {
    const error = new Error("Measurement failed");
    function BrokenRow(): never {
      throw error;
    }

    expect(() => measureLayout(<BrokenRow />, { width: 20 })).toThrow(error);
    expect(measureLayout(<Text>Recovered</Text>, { width: 20 }).height).toBe(1);
  });

  it("should measure during a live commit without disturbing the primary renderer", () => {
    function MeasuredRow() {
      const [height, setHeight] = useState(0);
      useLayoutEffect(() => {
        setHeight(
          measureLayout(<Text>{"x".repeat(30)}</Text>, { width: 10 }).height,
        );
      }, []);
      return <Text>{`Height: ${height}`}</Text>;
    }

    expect(renderToString(<MeasuredRow />, { columns: 20 })).toBe("Height: 3");
    expect(renderToString(<Text>Next frame</Text>)).toBe("Next frame");
  });
});
