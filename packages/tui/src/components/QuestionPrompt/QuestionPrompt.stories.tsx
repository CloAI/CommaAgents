import type { Meta, StoryObj } from "@storybook/react-vite";
import { QuestionPrompt } from "./QuestionPrompt";

const meta: Meta<typeof QuestionPrompt> = {
  title: "Components/QuestionPrompt",
  component: QuestionPrompt,
  args: {
    request: {
      type: "request_question",
      ts: "2026-06-28T16:15:00.000Z",
      requestId: "question_01JEXAMPLE",
      runId: "run_01JEXAMPLE",
      agentName: "reviewer",
      toolName: "request_user_input",
      question:
        "Should the empty state use the same terminal height as the populated list?",
    },
    onSubmit: () => {},
  },
  parameters: { xterm: { cols: 90, rows: 16 } },
};

export default meta;

type Story = StoryObj<typeof meta>;

export const ToolQuestion: Story = {};

export const AgentQuestion: Story = {
  args: {
    request: {
      type: "request_question",
      ts: "2026-06-28T16:15:00.000Z",
      requestId: "question_01JEXAMPLE2",
      runId: "run_01JEXAMPLE",
      agentName: "planner",
      question: "Which component state should be reviewed next?",
    },
  },
};
