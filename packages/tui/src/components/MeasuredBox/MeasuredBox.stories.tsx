import type { Meta, StoryObj } from "@storybook/react-vite";
import { Box, Text } from "ink";
import { MeasuredBox } from "./MeasuredBox";

/**
 * `MeasuredBox` is an Ink `<Box>` that exposes its measured dimensions to
 * its children via a render prop. The first frame renders empty while
 * Yoga performs the initial layout.
 */
const meta: Meta<typeof MeasuredBox> = {
  title: "Components/MeasuredBox",
  component: MeasuredBox,
};

export default meta;

type Story = StoryObj<typeof meta>;

export const Bordered: Story = {
  render: () => (
    <MeasuredBox borderStyle="round" width="50%" height={3} paddingX={1}>
      {({ width, height }) => <Text>{`Measured: ${width}×${height}`}</Text>}
    </MeasuredBox>
  ),
};

export const FillsAvailable: Story = {
  render: () => (
    <Box width={60} height={5} borderStyle="single">
      <MeasuredBox flexGrow={1}>
        {({ width, height, left, top }) => (
          <Text>{`w=${width} h=${height} left=${left} top=${top}`}</Text>
        )}
      </MeasuredBox>
    </Box>
  ),
};

export const TwoSideBySide: Story = {
  render: () => (
    <Box flexDirection="row" gap={2} width={70}>
      <MeasuredBox borderStyle="round" flexGrow={1} paddingX={1}>
        {({ width }) => <Text color="cyan">{`Left: ${width}c`}</Text>}
      </MeasuredBox>
      <MeasuredBox borderStyle="round" flexGrow={2} paddingX={1}>
        {({ width }) => <Text color="green">{`Right: ${width}c`}</Text>}
      </MeasuredBox>
    </Box>
  ),
};
