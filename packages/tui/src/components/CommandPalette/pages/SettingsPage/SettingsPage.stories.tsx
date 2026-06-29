import type { Meta, StoryObj } from "@storybook/react-vite";
import { useTheme } from "../../../../Theme";
import { SettingsPageRender } from "./SettingsPage";

interface SettingsPageStoryProps {
  readonly activeTheme: "dark" | "light" | "dracula" | "solarized-dark";
  readonly selectedIndex: number;
}

function SettingsPageStory({
  activeTheme,
  selectedIndex,
}: SettingsPageStoryProps): React.ReactElement {
  const tokens = useTheme();
  return (
    <SettingsPageRender
      tokens={tokens}
      config={{ themeName: activeTheme }}
      selectedIndex={selectedIndex}
      onSelectedIndexChange={() => {}}
      onSelected={() => {}}
      isFocused={false}
    />
  );
}

const meta: Meta<typeof SettingsPageStory> = {
  title: "Components/CommandPalette/SettingsPage",
  component: SettingsPageStory,
  args: { activeTheme: "dark", selectedIndex: 0 },
  argTypes: {
    activeTheme: {
      control: "select",
      options: ["dark", "light", "dracula", "solarized-dark"],
    },
  },
  parameters: { xterm: { cols: 90, rows: 14 } },
};

export default meta;

type Story = StoryObj<typeof meta>;

export const DarkActive: Story = {};

export const DraculaSelected: Story = {
  args: { activeTheme: "dark", selectedIndex: 2 },
};
