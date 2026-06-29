import type { Meta, StoryObj } from "@storybook/react-vite";
import { Text } from "ink";
import { SpawnedStrategyView } from "./SpawnedStrategyView";

const meta: Meta<typeof SpawnedStrategyView> = {
  title: "Components/MessageList/SpawnedStrategyView",
  component: SpawnedStrategyView,
  args: {
    args: JSON.stringify({
      name: "repository-review",
      input: "Review the TUI Storybook coverage and report missing states.",
      modelOverride: "openai/gpt-5",
    }),
    status: "running",
    onOpen: () => {},
    children: <Text dimColor>reviewer: inventorying component stories...</Text>,
  },
  parameters: { xterm: { cols: 90, rows: 14 } },
};

export default meta;

type Story = StoryObj<typeof meta>;

export const Running: Story = {};

export const Completed: Story = {
  args: {
    status: "completed",
    output: JSON.stringify({
      data: {
        path: "/runs/repository-review",
        finishReason: "stop",
        result: "All visual TUI components now have representative stories.",
      },
    }),
    children: <Text color="green">reviewer: coverage complete</Text>,
  },
};

export const Failed: Story = {
  args: {
    status: "error",
    error: "Strategy configuration could not be loaded",
    children: <Text color="red">reviewer: execution stopped</Text>,
  },
};
