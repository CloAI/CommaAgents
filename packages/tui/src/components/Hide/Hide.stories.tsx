import type { Meta, StoryObj } from "@storybook/react-vite";
import { Box, Text } from "ink";
import { Hide } from "./Hide";

/**
 * `Hide` conditionally renders children based on the active terminal width.
 * Use `below` / `above` with either a named breakpoint (`"sm"`, `"md"`, ...)
 * or a raw column count.
 *
 * The Storybook preview emulates an 80-column terminal by default; resize
 * the addon viewport (or change the `xterm` parameter) to see thresholds
 * trigger.
 */
const meta: Meta<typeof Hide> = {
  title: "Components/Hide",
  component: Hide,
};

export default meta;

type Story = StoryObj<typeof meta>;

export const HideBelowMedium: Story = {
  render: () => (
    <Box flexDirection="column">
      <Text>Always visible.</Text>
      <Hide below="md">
        <Text color="cyan">Visible only on md+ terminals.</Text>
      </Hide>
    </Box>
  ),
};

export const HideAboveColumns: Story = {
  render: () => (
    <Box flexDirection="column">
      <Text>Always visible.</Text>
      <Hide above={120}>
        <Text color="yellow">Hidden when terminal is wider than 120 cols.</Text>
      </Hide>
    </Box>
  ),
};

export const ResponsiveLayout: Story = {
  render: () => (
    <Box flexDirection="column" gap={1}>
      <Hide below="lg">
        <Text color="green">Wide-only header (lg+)</Text>
      </Hide>
      <Hide below="md">
        <Text color="cyan">Medium-and-up content</Text>
      </Hide>
      <Text>Always visible footer</Text>
    </Box>
  ),
};
