import type { Meta, StoryObj } from "@storybook/react-vite";
import type { StrategyOption } from "../StrategyPicker";
import { ChatTextArea } from "./ChatTextArea";

/**
 * `ChatTextArea` is the prompt composer used at the bottom of a session.
 * Tab cycles through `strategies`; Ctrl+S submits with the selected
 * strategy path; Meta+Enter submits from inside the text area itself.
 */
const strategies: readonly StrategyOption[] = [
  {
    label: "Plan",
    value: "/strategies/plan.ts",
    description: "Draft a step-by-step plan",
  },
  {
    label: "Code",
    value: "/strategies/code.ts",
    description: "Implement code changes",
  },
  {
    label: "Research",
    value: "/strategies/research.ts",
    description: "Gather context and links",
  },
];

const meta: Meta<typeof ChatTextArea> = {
  title: "Components/ChatTextArea",
  component: ChatTextArea,
  args: {
    strategies,
    onSubmit: (path: string, text: string) => {
      // eslint-disable-next-line no-console
      console.log("[ChatTextArea] submit", { path, text });
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
