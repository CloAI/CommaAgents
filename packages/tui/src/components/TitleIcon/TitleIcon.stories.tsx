import type { Meta, StoryObj } from "@storybook/react-vite";
import { Box, Text } from "ink";
import { TitleIcon } from "./TitleIcon";

/**
 * `TitleIcon` renders an animated ASCII-art splash icon driven by
 * pre-baked frame data. Pass `playing={false}` for a static frame, useful
 * for snapshot tests.
 */
const meta: Meta<typeof TitleIcon> = {
  title: "Components/TitleIcon",
  component: TitleIcon,
  args: {
    playing: true,
  },
  argTypes: {
    playing: { control: "boolean" },
  },
};

export default meta;

type Story = StoryObj<typeof meta>;

export const Animating: Story = {
  args: { playing: true },
};

export const Static: Story = {
  args: { playing: false },
};

export const InHeader: Story = {
  render: () => (
    <Box flexDirection="column" alignItems="center">
      <TitleIcon />
      <Box marginTop={1}>
        <Text bold>CommaAgents</Text>
      </Box>
      <Text dimColor>terminal UI</Text>
    </Box>
  ),
};
