import type { Meta, StoryObj } from "@storybook/react-vite";
import { Text } from "ink";
import { BorderedPanel } from "./BorderedPanel";

/**
 * `BorderedPanel` draws a single-line bordered column with the header text
 * embedded into the top border row. Colors fall back to the active theme.
 */
const meta: Meta<typeof BorderedPanel> = {
  title: "Components/BorderedPanel",
  component: BorderedPanel,
  args: {
    header: "planner",
    children: <Text>Hello from inside the panel.</Text>,
  },
  argTypes: {
    header: { control: "text" },
    borderColor: { control: "color" },
    backgroundColor: { control: "color" },
    headerColor: { control: "color" },
  },
};

export default meta;

type StoryType = StoryObj<typeof meta>;

export const Default: StoryType = {};

export const ColoredBorder: StoryType = {
  args: {
    header: "warning",
    borderColor: "yellow",
    headerColor: "yellow",
    children: <Text>Something deserves your attention.</Text>,
  },
};

export const MultilineContent: StoryType = {
  args: {
    header: "summary",
    borderColor: "cyan",
    children: (
      <>
        <Text>Line one of the panel content.</Text>
        <Text>Line two of the panel content.</Text>
        <Text dimColor>Line three is dim.</Text>
      </>
    ),
  },
};
