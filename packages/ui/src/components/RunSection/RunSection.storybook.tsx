import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import type {
  RunOutcomeStatus,
  RunPhase,
  RunToolStatus,
  RunErrorCode,
} from "@comma-agents/daemon";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";
import type { RunChild, RunMessage } from "../../hooks/runs";
import type { RunTool } from "./RunSection.types";
import { RunSection } from "./RunSection";

const createdAt = "2026-10-31T12:00:00Z";
const calls: readonly RunTool[] = Array.from(
  { length: 10 },
  (_, index): RunTool => {
    const tool = {
      type: "tool" as const,
      toolCallId: `call-${index}`,
      toolName: `read_file_${index}`,
      arguments: { path: `src/file-${index}.ts` },
    };
    if (index === 9) {
      return {
        ...tool,
        status: "failed" as RunToolStatus.failed,
        output: null,
        error: {
          code: "TOOL_EXECUTION_ERROR" as RunErrorCode.TOOL_EXECUTION_ERROR,
        },
      };
    }
    if (index === 8) {
      return { ...tool, status: "stopped" as RunToolStatus.stopped };
    }
    if (index > 5) {
      return { ...tool, status: "running" as RunToolStatus.running };
    }
    return {
      ...tool,
      status: "completed" as RunToolStatus.completed,
      output: { result: "File content" },
    };
  },
);
const jobs: readonly RunChild[] = [
  {
    type: "child.run",
    messageId: "job-a",
    runId: "run",
    childRunId: "job-a",
    sourceMessageId: "message",
    toolCallId: "call-0",
    strategyName: "Research",
    createdAt,
    phase: "running" as RunPhase.running,
  },
  {
    type: "child.run",
    messageId: "job-b",
    runId: "run",
    childRunId: "job-b",
    sourceMessageId: "message",
    toolCallId: "call-1",
    strategyName: "Review",
    createdAt,
    phase: "terminal" as RunPhase.terminal,
    outcome: "failed" as RunOutcomeStatus.failed,
  },
  {
    type: "child.run",
    messageId: "job-c",
    runId: "run",
    childRunId: "job-c",
    sourceMessageId: "message",
    toolCallId: "call-2",
    strategyName: "Finished",
    createdAt,
    phase: "terminal" as RunPhase.terminal,
    outcome: "completed" as RunOutcomeStatus.completed,
  },
];
const message: RunMessage = {
  role: "agent",
  id: "message",
  agentName: "Assistant",
  createdAt,
  streaming: false,
  content: calls,
};
const meta = {
  title: "Components/RunSection",
  component: RunSection,
  args: { message, childRuns: jobs, onOpenChild: fn() },
} satisfies Meta<typeof RunSection>;

// oxlint-disable-next-line import/no-default-export -- Storybook requires default metadata.
export default meta;
type Story = StoryObj<typeof meta>;

export const GroupedTools: Story = {
  args: {
    childRuns: [
      ...jobs,
      {
        ...jobs[0]!,
        childRunId: "foreign",
        sourceMessageId: "other-message",
        strategyName: "Other message",
      },
    ],
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const group = canvas.getByRole("button", { name: /10 tools/ });
    await expect(group).toHaveAttribute("aria-expanded", "false");
    await expect(group).toHaveTextContent("1 failed");
    await expect(
      canvas.queryByRole("button", { name: "Open Other message" }),
    ).not.toBeInTheDocument();
    await expect(group).toHaveTextContent("1 stopped");
    await expect(canvas.queryByText("read_file_0")).not.toBeVisible();
    await expect(
      canvas.getByRole("button", { name: "Open Research" }),
    ).toBeVisible();
    await expect(
      canvas.getByRole("button", { name: "Open Review" }),
    ).toBeVisible();
    await expect(
      canvas.queryByRole("button", { name: "Open Finished" }),
    ).not.toBeInTheDocument();
    await userEvent.click(
      canvas.getByRole("button", { name: "Open Research" }),
    );
    await expect(args.onOpenChild).toHaveBeenCalledWith(jobs[0]);
    group.focus();
    await userEvent.keyboard("{Enter}");
    await expect(group).toHaveAttribute("aria-expanded", "true");
    await expect(canvas.getByText("read_file_0")).toBeVisible();
    await expect(
      canvas.getByRole("button", { name: "Open Finished" }),
    ).toBeVisible();
    await expect(
      canvas.getAllByRole("button", { name: "Open Research" }),
    ).toHaveLength(1);
    await userEvent.click(canvas.getByText("read_file_0"));
    await expect(canvas.getAllByText("Arguments")[0]!).toBeVisible();
    await userEvent.click(group);
    await userEvent.click(group);
    await expect(canvas.getAllByText("Arguments")[0]!).toBeVisible();
  },
};

function StreamingExample() {
  const [step, setStep] = useState(0);
  const tools =
    step === 0
      ? calls.slice(0, 1)
      : step === 1
        ? calls.slice(0, 2)
        : calls.slice(0, 3).map((tool) => ({
            ...tool,
            status: "completed" as RunToolStatus.completed,
            output: { result: "File content" },
          }));
  const children =
    step < 2
      ? jobs
      : jobs.map((child) => ({
          ...child,
          phase: "terminal" as RunPhase.terminal,
          outcome: "completed" as RunOutcomeStatus.completed,
        }));
  return (
    <>
      <button onClick={() => setStep((value) => value + 1)}>
        Receive update
      </button>
      <RunSection
        message={{ ...message, streaming: step < 2, content: tools }}
        childRuns={children}
        onOpenChild={fn()}
      />
    </>
  );
}

export const Streaming: Story = {
  render: () => <StreamingExample />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.queryByRole("button", { name: /tools/ }),
    ).not.toBeInTheDocument();
    await userEvent.click(canvas.getByText("read_file_0"));
    await userEvent.click(
      canvas.getByRole("button", { name: "Receive update" }),
    );
    const group = canvas.getByRole("button", { name: /2 tools/ });
    await userEvent.click(group);
    await expect(canvas.getAllByText("Arguments")[0]!).toBeVisible();
    await userEvent.click(
      canvas.getByRole("button", { name: "Receive update" }),
    );
    await expect(
      canvas.getByRole("button", { name: /3 tools/ }),
    ).toHaveAttribute("aria-expanded", "true");
    await expect(canvas.getAllByText("Arguments")[0]!).toBeVisible();
    await userEvent.click(group);
    await expect(
      canvas.queryByRole("button", { name: "Open Research" }),
    ).not.toBeInTheDocument();
    await userEvent.click(
      canvas.getByRole("button", { name: "Receive update" }),
    );
    await expect(group).toHaveAttribute("aria-expanded", "false");
  },
};

const prose = `# Readable conversation

Body text with \`inlineCode()\` at the same size.

## Details

- First item
- Second item

> A quoted explanation.

| Name | Result |
| --- | --- |
| Check | Passed |

\`\`\`ts
const readable = '${"long code content ".repeat(20)}';
\`\`\``;
export const Typography: Story = {
  args: {
    message: { ...message, content: [{ type: "text", text: prose }] },
    childRuns: [],
  },
  decorators: [
    (Story) => (
      <div style={{ width: "20rem", maxWidth: "100%" }}>
        <Story />
      </div>
    ),
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await canvas.findByRole("heading", { name: "Readable conversation" });
    const inline = canvas.getByText("inlineCode()");
    const code = canvasElement.querySelector("pre > code")!;
    const paragraph = inline.parentElement!;
    const rootSize = getComputedStyle(document.documentElement).fontSize;
    await expect(getComputedStyle(inline).fontSize).toBe(rootSize);
    await expect(getComputedStyle(code).fontSize).toBe(rootSize);
    await expect(getComputedStyle(paragraph).fontSize).toBe(rootSize);
    await expect(getComputedStyle(code).fontFamily).toContain("Geist Mono");
    await expect(getComputedStyle(paragraph).fontFamily).toContain("system-ui");
    await expect(
      parseFloat(getComputedStyle(paragraph).lineHeight),
    ).toBeCloseTo(parseFloat(rootSize) * 1.4, 1);
    await expect(parseFloat(getComputedStyle(code).lineHeight)).toBeCloseTo(
      parseFloat(rootSize) * 1.35,
      1,
    );
    await expect(getComputedStyle(code).padding).toBe("0px");
    const pre = code.parentElement!;
    await expect(pre.scrollWidth).toBeGreaterThan(pre.clientWidth);
    await expect(canvasElement.scrollWidth).toBeLessThanOrEqual(
      canvasElement.clientWidth,
    );
    const writeText = fn().mockResolvedValue(undefined);
    const clipboard = Object.getOwnPropertyDescriptor(navigator, "clipboard");
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    try {
      await userEvent.click(canvas.getByRole("button", { name: "Copy" }));
      await waitFor(() =>
        expect(writeText).toHaveBeenCalledWith(pre.textContent),
      );
    } finally {
      if (clipboard) {
        Object.defineProperty(navigator, "clipboard", clipboard);
      } else {
        Reflect.deleteProperty(navigator, "clipboard");
      }
    }
  },
};
export const UserTypography: Story = {
  ...Typography,
  args: {
    message: {
      ...message,
      role: "user",
      content: [{ type: "text", text: prose }],
    },
    childRuns: [],
  },
};

export const NarrowTools: Story = {
  ...GroupedTools,
  decorators: [
    (Story) => (
      <div style={{ width: "20rem", maxWidth: "100%" }}>
        <Story />
      </div>
    ),
  ],
};
