import type { Meta, StoryObj } from "@storybook/react-vite";
import { ChatTextArea } from "./ChatTextArea";

const strategies = [
  {
    label: "Plan",
    value: "/strategies/plan.ts",
    description: "Plan implementation work",
  },
  {
    label: "Build",
    value: "/strategies/build.ts",
    description: "Implement a requested change",
  },
];

const meta: Meta<typeof ChatTextArea> = {
  title: "Components/ChatTextArea",
  component: ChatTextArea,
  args: {
    strategies,
    onSubmit: (strategy, text) => {
      // eslint-disable-next-line no-console -- Storybook logging
      console.log("[ChatTextArea] submit", { strategy, text });
    },
  },
};

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const FixedWidth: Story = {
  args: {
    id: "chat-input",
    width: 80,
    height: 8,
    placeholder: "Ask the agent anything...",
  },
};

export const SingleStrategy: Story = {
  args: {
    strategies: [strategies[0]!],
    height: 6,
    placeholder: "Type your prompt and press Ctrl+S to submit",
  },
};

export const ManyStrategies: Story = {
  args: {
    strategies: [
      ...strategies,
      {
        label: "Review",
        value: "/strategies/review.ts",
        description: "Audit changes",
      },
      {
        label: "Summarize",
        value: "/strategies/summarize.ts",
        description: "Condense long content",
      },
    ],
    height: 6,
  },
};
