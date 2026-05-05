import type { Meta, StoryObj } from "@storybook/react-vite";
import { SystemMessage } from "./SystemMessage";

/**
 * `SystemMessage` renders strategy lifecycle events, step transitions, and
 * surfaced errors inside a bordered panel with a fixed `"system"` header.
 */
const meta: Meta<typeof SystemMessage> = {
  title: "Components/MessageList/SystemMessage",
  component: SystemMessage,
  args: {
    text: "Strategy 'refactor-tui' started (run_id=run_8c2f).",
  },
  argTypes: {
    text: { control: "text" },
  },
};

export default meta;

type Story = StoryObj<typeof meta>;

export const StrategyStarted: Story = {};

export const StepCompleted: Story = {
  args: {
    text: "Step 'plan' completed in 1.2s.",
  },
};

export const Error: Story = {
  args: {
    text: "Error: failed to load strategy at /strategies/missing.ts (ENOENT).",
  },
};

export const Multiline: Story = {
  args: {
    text: "Strategy completed.\n  steps: 4\n  duration: 18.7s\n  result: success",
  },
};
