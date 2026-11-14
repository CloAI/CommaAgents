import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { StrategySelectRender } from "../StrategySelect";
import { StrategyControlsRender } from "./StrategyControls";

const meta = {
  title: "Components/StrategyControls",
  component: StrategyControlsRender,
  args: {
    selector: (
      <StrategySelectRender
        status="ready"
        strategies={[]}
        selected={undefined}
        onSelect={fn()}
      />
    ),
  },
  parameters: {
    docs: {
      description: {
        component:
          "Strategy and model choices with attachment and dictation placeholders aligned to the right. Both future actions are disabled and marked coming soon.",
      },
    },
  },
} satisfies Meta<typeof StrategyControlsRender>;

// oxlint-disable-next-line import/no-default-export -- Storybook requires default metadata.
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Narrow: Story = {
  decorators: [
    (Story) => (
      <div style={{ width: 240 }}>
        <Story />
      </div>
    ),
  ],
};
