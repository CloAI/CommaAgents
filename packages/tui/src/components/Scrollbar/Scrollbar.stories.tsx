import type { Meta, StoryObj } from "@storybook/react-vite";
import { Box, Text } from "ink";
import { Scrollbar } from "./Scrollbar";

/**
 * `Scrollbar` is a presentational vertical scrollbar driven by caller-owned
 * state — `total`, `windowSize`, and `offset`. The component itself owns
 * no state; it just renders the geometry.
 */
const meta: Meta<typeof Scrollbar> = {
  title: "Components/Scrollbar",
  component: Scrollbar,
  args: {
    total: 200,
    windowSize: 20,
    offset: 0,
    height: 20,
  },
  argTypes: {
    total: { control: { type: "number", min: 1 } },
    windowSize: { control: { type: "number", min: 1 } },
    offset: { control: { type: "number", min: 0 } },
    height: { control: { type: "number", min: 1 } },
  },
};

export default meta;

type Story = StoryObj<typeof meta>;

export const AtTop: Story = {
  args: { total: 200, windowSize: 20, offset: 0, height: 20 },
};

export const Middle: Story = {
  args: { total: 200, windowSize: 20, offset: 90, height: 20 },
};

export const AtBottom: Story = {
  args: { total: 200, windowSize: 20, offset: 180, height: 20 },
};

export const ContentFits: Story = {
  args: { total: 10, windowSize: 20, offset: 0, height: 20 },
};

export const SideBySide: Story = {
  render: () => (
    <Box flexDirection="row" gap={3}>
      <Box flexDirection="column">
        <Text dimColor>top</Text>
        <Box height={12}>
          <Scrollbar total={200} windowSize={12} offset={0} height={12} />
        </Box>
      </Box>
      <Box flexDirection="column">
        <Text dimColor>mid</Text>
        <Box height={12}>
          <Scrollbar total={200} windowSize={12} offset={94} height={12} />
        </Box>
      </Box>
      <Box flexDirection="column">
        <Text dimColor>bot</Text>
        <Box height={12}>
          <Scrollbar total={200} windowSize={12} offset={188} height={12} />
        </Box>
      </Box>
    </Box>
  ),
};
