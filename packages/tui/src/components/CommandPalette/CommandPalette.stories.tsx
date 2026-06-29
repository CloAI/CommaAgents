import type { Meta, StoryObj } from "@storybook/react-vite";
import { CommandPaletteRender } from "./CommandPalette";
import { BUILT_IN_COMMANDS } from "./CommandPalette.constants";

const meta: Meta<typeof CommandPaletteRender> = {
  title: "Components/CommandPalette",
  component: CommandPaletteRender,
  args: {
    query: "",
    filtered: BUILT_IN_COMMANDS,
    selectedIndex: 0,
    onSelectedIndexChange: () => {},
    onCommandSelected: () => {},
    isFocused: false,
  },
  parameters: { xterm: { cols: 90, rows: 22 } },
};

export default meta;

type Story = StoryObj<typeof meta>;

export const AllCommands: Story = {};

export const Filtered: Story = {
  args: {
    query: "provider",
    filtered: BUILT_IN_COMMANDS.filter((command) =>
      command.label.toLowerCase().includes("provider"),
    ),
  },
};

export const NoMatches: Story = {
  args: {
    query: "missing-command",
    filtered: [],
  },
};
