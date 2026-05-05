import type { Meta, StoryObj } from "@storybook/react-vite";
import { Box, Text } from "ink";
import { Separator } from "./Separator";

/**
 * `Separator` draws a horizontal divider line. With the default
 * `width="full"`, it stretches to fill its parent flex container, so for
 * stories we wrap it in a sized `<Box>`.
 */
const meta: Meta<typeof Separator> = {
  title: "Components/Separator",
  component: Separator,
};

export default meta;

type Story = StoryObj<typeof meta>;

export const FullWidth: Story = {
  render: () => (
    <Box flexDirection="column" width={50}>
      <Text>Above the line</Text>
      <Separator />
      <Text>Below the line</Text>
    </Box>
  ),
};

export const FixedWidth: Story = {
  render: () => (
    <Box flexDirection="column">
      <Text>Above (separator is 20 chars wide)</Text>
      <Separator width={20} />
      <Text>Below</Text>
    </Box>
  ),
};

export const BetweenSections: Story = {
  render: () => (
    <Box flexDirection="column" width={60} gap={0}>
      <Text bold>Section A</Text>
      <Text dimColor>Some content for section A.</Text>
      <Separator />
      <Text bold>Section B</Text>
      <Text dimColor>Some content for section B.</Text>
      <Separator />
      <Text bold>Section C</Text>
      <Text dimColor>Some content for section C.</Text>
    </Box>
  ),
};
