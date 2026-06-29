import type { Meta, StoryObj } from "@storybook/react-vite";
import { ToolCallView } from "./ToolCallView";

const meta: Meta<typeof ToolCallView> = {
  title: "Components/MessageList/ToolCallView",
  component: ToolCallView,
  args: {
    toolName: "read_file",
    args: JSON.stringify({ path: "packages/tui/src/components/Button.tsx" }),
    status: "running",
  },
  argTypes: {
    status: {
      control: "inline-radio",
      options: ["running", "completed", "error"],
    },
  },
};

export default meta;

type Story = StoryObj<typeof meta>;

export const Running: Story = {};

export const Completed: Story = {
  args: {
    status: "completed",
    output: "line one\nline two\nline three",
  },
};

export const Failed: Story = {
  args: {
    toolName: "write_file",
    args: JSON.stringify({ path: "/read-only/output.ts" }),
    status: "error",
    error: "EACCES: permission denied",
  },
};

export const LongArguments: Story = {
  args: {
    toolName: "run_command",
    args: JSON.stringify({
      command:
        "bun test packages/tui/src/components --coverage --max-concurrency=1",
      timeout: 120_000,
      environment: { CI: "true", FORCE_COLOR: "1" },
    }),
    status: "completed",
    output: "42 pass\n0 fail",
  },
};
