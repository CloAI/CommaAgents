import type { Meta, StoryObj } from "@storybook/react-vite";
import type { StrategyOption } from "./StrategyPicker";
import { StrategyPicker } from "./StrategyPicker";

/**
 * `StrategyPicker` is a focused list of selectable strategies, used at
 * session-creation time. It owns no state — the parent reacts to
 * `onSelect(value)`.
 */

const sampleStrategies: readonly StrategyOption[] = [
  {
    label: "planner",
    value: "/strategies/planner.ts",
    description: "Decompose goals into actionable steps.",
  },
  {
    label: "researcher",
    value: "/strategies/researcher.ts",
    description: "Gather context from multiple sources.",
  },
  {
    label: "coder",
    value: "/strategies/coder.ts",
    description: "Implement and verify code changes.",
  },
  {
    label: "reviewer",
    value: "/strategies/reviewer.ts",
    description: "Audit changes against best practices.",
  },
];

const meta: Meta<typeof StrategyPicker> = {
  title: "Components/StrategyPicker",
  component: StrategyPicker,
  args: {
    strategies: sampleStrategies,
    onSelect: (path: string) => {
      // eslint-disable-next-line no-console
      console.log("[StrategyPicker] selected", path);
    },
  },
};

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const SingleOption: Story = {
  args: {
    strategies: [sampleStrategies[0]!],
  },
};

export const ManyOptions: Story = {
  args: {
    strategies: [
      ...sampleStrategies,
      {
        label: "summarizer",
        value: "/strategies/summarizer.ts",
        description: "Condense long-form content.",
      },
      {
        label: "translator",
        value: "/strategies/translator.ts",
        description: "Translate text between languages.",
      },
      {
        label: "debater",
        value: "/strategies/debater.ts",
        description: "Argue both sides of a question.",
      },
    ],
  },
};
