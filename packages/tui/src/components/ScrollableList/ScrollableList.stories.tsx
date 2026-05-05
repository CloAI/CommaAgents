import type { Meta, StoryObj } from "@storybook/react-vite";
import { Box, Text } from "ink";
import { useState } from "react";
import { ScrollableList } from "./ScrollableList";

interface MenuItem {
  readonly id: string;
  readonly label: string;
}

const items: MenuItem[] = [
  { id: "1", label: "Open file…" },
  { id: "2", label: "Save" },
  { id: "3", label: "Save As…" },
  { id: "4", label: "Close" },
  { id: "5", label: "Quit" },
];

const longItems: MenuItem[] = Array.from({ length: 30 }, (_, i) => ({
  id: `item-${i}`,
  label: `Option ${i + 1}`,
}));

/**
 * `ScrollableList` is a generic single-selection list. Up/Down arrows
 * move the highlight, Enter fires `onSelected`. Mouse-wheel scrolls the
 * underlying viewport independently of the selection.
 */
const meta: Meta<typeof ScrollableList<MenuItem>> = {
  title: "Components/ScrollableList",
  component: ScrollableList,
};

export default meta;

type Story = StoryObj<typeof meta>;

function ControlledList({
  items: itemsArg,
  emptyText,
}: {
  items: readonly MenuItem[];
  emptyText?: string;
}) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  return (
    <Box width={40} height={Math.min(itemsArg.length + 2, 12)} flexDirection="column">
      <ScrollableList<MenuItem>
        items={itemsArg}
        getKey={(item) => item.id}
        renderItem={(item, isSelected) => (
          <Text inverse={isSelected}>
            {isSelected ? "› " : "  "}
            {item.label}
          </Text>
        )}
        selectedIndex={selectedIndex}
        onSelectedIndexChange={setSelectedIndex}
        onSelected={(item) => {
          // eslint-disable-next-line no-console
          console.log("[ScrollableList] selected", item);
        }}
        emptyText={emptyText}
      />
    </Box>
  );
}

export const ShortList: Story = {
  render: () => <ControlledList items={items} />,
};

export const LongScrollableList: Story = {
  render: () => <ControlledList items={longItems} />,
};

export const Empty: Story = {
  render: () => <ControlledList items={[]} emptyText="No matches found." />,
};
