import type { Meta, StoryObj } from "@storybook/react-vite";
import { useTheme } from "../../../../Theme";
import { HelpPageRender } from "./HelpPage";

function HelpPageStory(): React.ReactElement {
  const tokens = useTheme();
  return <HelpPageRender tokens={tokens} />;
}

const meta: Meta<typeof HelpPageStory> = {
  title: "Components/CommandPalette/HelpPage",
  component: HelpPageStory,
};

export default meta;

type Story = StoryObj<typeof meta>;

export const KeyboardShortcuts: Story = {};
