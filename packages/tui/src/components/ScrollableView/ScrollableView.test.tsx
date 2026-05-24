import { describe, expect, it } from "bun:test";
import { Box, Text } from "ink";
import { render } from "ink-testing-library";
import type React from "react";

import { ScrollableView } from "./ScrollableView";

interface Item {
  readonly id: string;
  readonly label: string;
}

/** Generate `count` items, each rendering as a single-line `<Text>`. */
function makeItems(count: number): readonly Item[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `item-${index}`,
    label: `Item ${index}`,
  }));
}

/**
 * Wait long enough for Ink to flush measurement-driven re-renders.
 *
 * Row heights are now measured synchronously via the patched
 * `measureLayout`, so the only remaining post-commit measurement is the
 * viewport itself (via `useBoxMetrics`). One or two macrotasks is enough
 * for the viewport's first non-zero frame to settle.
 */
async function flushFrames(): Promise<void> {
  for (let i = 0; i < 5; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

/**
 * Render a `ScrollableView` inside a fixed-size Box so the measurement
 * pipeline has a deterministic viewport. Without an explicit height,
 * `flexGrow: 1` collapses to 0 in `ink-testing-library`'s synthetic stdout.
 */
function renderInViewport(
  element: React.ReactElement,
  options: { height: number; width?: number } = { height: 10, width: 40 },
): ReturnType<typeof render> {
  return render(
    <Box
      height={options.height}
      width={options.width ?? 40}
      flexDirection="column"
    >
      {element}
    </Box>,
  );
}

describe("ScrollableView measurement", () => {
  it("should render the empty-state text when items is empty", async () => {
    const result = renderInViewport(
      <ScrollableView<Item>
        items={[]}
        getKey={(item) => item.id}
        renderItem={(item) => <Text>{item.label}</Text>}
        emptyText="Nothing here."
      />,
    );
    await flushFrames();
    expect(result.lastFrame()).toContain("Nothing here.");
    result.cleanup();
  });

  it("should render all items and no scrollbar when content fits the viewport", async () => {
    const items = makeItems(5);
    const result = renderInViewport(
      <ScrollableView<Item>
        items={items}
        getKey={(item) => item.id}
        renderItem={(item) => <Text>{item.label}</Text>}
      />,
      { height: 10, width: 30 },
    );
    await flushFrames();
    const frame = result.lastFrame() ?? "";
    expect(frame).toContain("Item 0");
    expect(frame).toContain("Item 4");
    // Scrollbar glyphs should NOT appear when content fits.
    expect(/\u2588|\u2502/.test(frame)).toBe(false);
    result.cleanup();
  });

  it("should clip content and render a scrollbar when items exceed the viewport", async () => {
    const items = makeItems(50);
    const result = renderInViewport(
      <ScrollableView<Item>
        items={items}
        getKey={(item) => item.id}
        renderItem={(item) => <Text>{item.label}</Text>}
      />,
      { height: 5, width: 30 },
    );
    await flushFrames();
    const frame = result.lastFrame() ?? "";
    // Top items should be visible; far-future items should not.
    expect(frame).toContain("Item 0");
    expect(frame.includes("Item 49")).toBe(false);
    expect(frame.includes("Item 30")).toBe(false);
    // Scrollbar glyph (thumb `█` or track `│`) should appear.
    expect(/\u2588|\u2502/.test(frame)).toBe(true);
    result.cleanup();
  });

  it("should pin to the bottom when stickToBottom is true", async () => {
    const items = makeItems(50);
    const result = renderInViewport(
      <ScrollableView<Item>
        items={items}
        getKey={(item) => item.id}
        renderItem={(item) => <Text>{item.label}</Text>}
        stickToBottom
      />,
      { height: 5, width: 30 },
    );
    await flushFrames();
    const frame = result.lastFrame() ?? "";
    // The latest items should be visible at the bottom of the viewport.
    expect(frame).toContain("Item 49");
    expect(frame.includes("Item 0")).toBe(false);
    result.cleanup();
  });

  it("should scroll the requested row into view via scrollToRow", async () => {
    const items = makeItems(50);
    const result = renderInViewport(
      <ScrollableView<Item>
        items={items}
        getKey={(item) => item.id}
        renderItem={(item) => <Text>{item.label}</Text>}
        scrollToRow={25}
      />,
      { height: 5, width: 30 },
    );
    await flushFrames();
    const frame = result.lastFrame() ?? "";
    expect(frame).toContain("Item 25");
    // Items far above and below the target should not be in the visible window.
    expect(frame.includes("Item 0")).toBe(false);
    expect(frame.includes("Item 49")).toBe(false);
    result.cleanup();
  });
});
