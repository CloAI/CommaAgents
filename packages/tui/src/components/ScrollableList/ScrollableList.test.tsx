import { describe, expect, it } from "bun:test";
import { Box, Text } from "ink";
import { render } from "ink-testing-library";
import type React from "react";

import { ScrollableList } from "./ScrollableList";

interface Item {
  readonly id: string;
  readonly label: string;
}

function makeItems(count: number): readonly Item[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `item-${index}`,
    label: `Item ${index}`,
  }));
}

/**
 * Wait long enough for Ink to flush all measurement-driven re-renders.
 * Mirrors the helper in `ScrollableView.test.tsx`.
 */
async function flushFrames(): Promise<void> {
  for (let i = 0; i < 5; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

function renderInViewport(
  element: React.ReactElement,
  options: { height: number; width?: number } = { height: 5, width: 30 },
): ReturnType<typeof render> {
  return render(
    <Box
      height={options.height}
      width={options.width ?? 30}
      flexDirection="column"
    >
      {element}
    </Box>,
  );
}

describe("ScrollableList selection", () => {
  it("should render the empty-state text when items is empty", async () => {
    const result = renderInViewport(
      <ScrollableList<Item>
        items={[]}
        getKey={(item) => item.id}
        selectedIndex={0}
        onSelectedIndexChange={() => {}}
        renderItem={(item) => <Text>{item.label}</Text>}
        emptyText="No commands."
      />,
    );
    await flushFrames();
    expect(result.lastFrame()).toContain("No commands.");
    result.cleanup();
  });

  it("should pass `isSelected=true` to the selected row's renderItem", async () => {
    const items = makeItems(3);
    const result = renderInViewport(
      <ScrollableList<Item>
        items={items}
        getKey={(item) => item.id}
        selectedIndex={1}
        onSelectedIndexChange={() => {}}
        renderItem={(item, isSelected) => (
          <Text>{isSelected ? `> ${item.label}` : `  ${item.label}`}</Text>
        )}
      />,
    );
    await flushFrames();
    const frame = result.lastFrame() ?? "";
    expect(frame).toContain("  Item 0");
    expect(frame).toContain("> Item 1");
    expect(frame).toContain("  Item 2");
    result.cleanup();
  });

  it("should keep the selected row visible after `selectedIndex` jumps far down", async () => {
    const items = makeItems(50);
    const { rerender, lastFrame, cleanup } = renderInViewport(
      <ScrollableList<Item>
        items={items}
        getKey={(item) => item.id}
        selectedIndex={0}
        onSelectedIndexChange={() => {}}
        renderItem={(item, isSelected) => (
          <Text>{isSelected ? `> ${item.label}` : `  ${item.label}`}</Text>
        )}
      />,
    );
    await flushFrames();
    expect(lastFrame() ?? "").toContain("Item 0");

    rerender(
      <Box height={5} width={30} flexDirection="column">
        <ScrollableList<Item>
          items={items}
          getKey={(item) => item.id}
          selectedIndex={30}
          onSelectedIndexChange={() => {}}
          renderItem={(item, isSelected) => (
            <Text>{isSelected ? `> ${item.label}` : `  ${item.label}`}</Text>
          )}
        />
      </Box>,
    );
    await flushFrames();
    const frame = lastFrame() ?? "";
    expect(frame).toContain("> Item 30");
    // The previously-visible top items should be off-screen now.
    expect(frame.includes("Item 0\n")).toBe(false);
    cleanup();
  });

  it("should clamp out-of-range selectedIndex to the last item", async () => {
    const items = makeItems(5);
    const result = renderInViewport(
      <ScrollableList<Item>
        items={items}
        getKey={(item) => item.id}
        selectedIndex={999}
        onSelectedIndexChange={() => {}}
        renderItem={(item, isSelected) => (
          <Text>{isSelected ? `> ${item.label}` : `  ${item.label}`}</Text>
        )}
      />,
      { height: 10, width: 30 },
    );
    await flushFrames();
    const frame = result.lastFrame() ?? "";
    expect(frame).toContain("> Item 4");
    expect(frame).toContain("  Item 0");
    result.cleanup();
  });
});
