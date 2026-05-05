import type { Meta, StoryObj } from "@storybook/react-vite";
import { Box, Text } from "ink";
import { ScrollableView } from "./ScrollableView";

interface Row {
  readonly id: string;
  readonly text: string;
}

const rows: Row[] = Array.from({ length: 50 }, (_, i) => ({
  id: `row-${i}`,
  text: `Row ${i + 1} — example content`,
}));

const variableRows: Row[] = [
  { id: "a", text: "Single line row." },
  { id: "b", text: "Two line\nrow with newline." },
  { id: "c", text: "Single line row." },
  {
    id: "d",
    text: "Three\nline\nrow.",
  },
  { id: "e", text: "Single line row." },
  ...Array.from({ length: 20 }, (_, i) => ({
    id: `extra-${i}`,
    text: `Filler row ${i + 1}.`,
  })),
];

/**
 * `ScrollableView` is the lower-level scrolling primitive used by
 * `ScrollableList` and `MessageList`. It owns no selection — only an
 * offset and a mouse-wheel handler. `getRowHeight` must be deterministic.
 */
const meta: Meta<typeof ScrollableView<Row>> = {
  title: "Components/ScrollableView",
  component: ScrollableView,
};

export default meta;

type Story = StoryObj<typeof meta>;

export const FixedHeightRows: Story = {
  render: () => (
    <Box width={50} height={10} flexDirection="column" borderStyle="single">
      <ScrollableView<Row>
        items={rows}
        getKey={(item) => item.id}
        renderItem={(item) => <Text>{item.text}</Text>}
        getRowHeight={() => 1}
      />
    </Box>
  ),
};

export const StickToBottom: Story = {
  render: () => (
    <Box width={50} height={10} flexDirection="column" borderStyle="single">
      <ScrollableView<Row>
        items={rows}
        getKey={(item) => item.id}
        renderItem={(item) => <Text>{item.text}</Text>}
        getRowHeight={() => 1}
        stickToBottom
      />
    </Box>
  ),
};

export const VariableHeightRows: Story = {
  render: () => (
    <Box width={40} height={12} flexDirection="column" borderStyle="single">
      <ScrollableView<Row>
        items={variableRows}
        getKey={(item) => item.id}
        renderItem={(item) => <Text>{item.text}</Text>}
        getRowHeight={(item) => item.text.split("\n").length}
      />
    </Box>
  ),
};

export const Empty: Story = {
  render: () => (
    <Box width={40} height={6} borderStyle="single">
      <ScrollableView<Row>
        items={[]}
        getKey={(item) => item.id}
        renderItem={(item) => <Text>{item.text}</Text>}
        emptyText="Nothing here yet."
      />
    </Box>
  ),
};
