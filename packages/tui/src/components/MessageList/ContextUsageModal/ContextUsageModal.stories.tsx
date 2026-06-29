import type { Meta, StoryObj } from "@storybook/react-vite";
import { ContextUsageModalRender } from "./ContextUsageModal";

const meta: Meta<typeof ContextUsageModalRender> = {
  title: "Components/MessageList/ContextUsageModal",
  component: ContextUsageModalRender,
  args: {
    payload: {
      agentName: "planner",
      model: "openai/gpt-5",
      contextWindow: 128_000,
      contextUsage: {
        totalTokens: 33_000,
        inputTokens: 32_000,
        outputTokens: 1_000,
        inputTokenDetails: {
          noCacheTokens: 30_000,
          cacheReadTokens: 1_500,
          cacheWriteTokens: 500,
        },
        outputTokenDetails: {
          textTokens: 700,
          reasoningTokens: 300,
        },
      },
    },
  },
};

export default meta;

type Story = StoryObj<typeof meta>;

export const DetailedUsage: Story = {};

export const TotalOnly: Story = {
  args: {
    payload: {
      agentName: "writer",
      contextUsage: { totalTokens: 42 },
    },
  },
};

export const LargeContext: Story = {
  args: {
    payload: {
      agentName: "researcher",
      model: "anthropic/claude-opus-4-1",
      contextWindow: 1_000_000,
      contextUsage: {
        totalTokens: 754_200,
        inputTokens: 750_000,
        outputTokens: 4_200,
      },
    },
  },
};
