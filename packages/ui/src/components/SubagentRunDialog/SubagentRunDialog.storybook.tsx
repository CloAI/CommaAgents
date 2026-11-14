import type { Meta, StoryObj } from "@storybook/react-vite";
import type { RunPhase, RunToolStatus } from "@comma-agents/daemon";
import { expect, fn, userEvent, within } from "storybook/test";
import type { RunChild, RunMessage } from "../../hooks/runs";
import { SubagentRunDialogRender } from "./SubagentRunDialog";

const createdAt = "2026-10-31T12:00:00Z";
const child: RunChild = {
  type: "child.run",
  messageId: "nested-child",
  runId: "research",
  childRunId: "review",
  sourceMessageId: "research-message",
  toolCallId: "delegate",
  strategyName: "Review",
  createdAt,
  phase: "running" as RunPhase.running,
};
const message: RunMessage = {
  role: "agent",
  id: "research-message",
  agentName: "Researcher",
  createdAt,
  streaming: false,
  content: [
    {
      type: "text",
      text: "Reviewed the UI components. A second agent is checking keyboard access.",
    },
    {
      type: "tool",
      toolCallId: "delegate",
      toolName: "launch_strategy",
      arguments: { strategy: "Review" },
      status: "running" as RunToolStatus.running,
    },
  ],
};
const meta = {
  title: "Components/SubagentRunDialog",
  component: SubagentRunDialogRender,
  args: {
    title: "Subagent: Research",
    messages: [message],
    childRuns: [],
    status: "running",
    onClose: fn(),
    onOpenChild: fn(),
  },
} satisfies Meta<typeof SubagentRunDialogRender>;

// oxlint-disable-next-line import/no-default-export -- Storybook requires default metadata.
export default meta;
type Story = StoryObj<typeof meta>;

export const Running: Story = {};
export const Completed: Story = {
  args: {
    status: "completed",
    messages: [
      {
        ...message,
        content: [
          { type: "text", text: "Review complete. All checks passed." },
        ],
      },
    ],
  },
};
export const Stopped: Story = { args: { status: "stopped" } };
export const Failed: Story = {
  args: {
    status: "failed",
    error: "The provider disconnected during the review.",
  },
};
export const Empty: Story = { args: { messages: [] } };
export const NestedSubagents: Story = {
  args: { childRuns: [child], onBack: fn() },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Open Review" }));
    await expect(args.onOpenChild).toHaveBeenCalledWith(child);
    await userEvent.click(canvas.getByRole("button", { name: "Back" }));
    await expect(args.onBack).toHaveBeenCalledOnce();
    await userEvent.click(canvas.getByRole("button", { name: "Close dialog" }));
    await expect(args.onClose).toHaveBeenCalledOnce();
  },
};
export const LongContent: Story = {
  args: {
    messages: Array.from({ length: 12 }, (_, index) => ({
      ...message,
      id: `message-${index}`,
      content: [
        {
          type: "text" as const,
          text: `Finding ${index + 1}: ${"Keep the results readable in a narrow pane. ".repeat(8)}`,
        },
      ],
    })),
  },
};
