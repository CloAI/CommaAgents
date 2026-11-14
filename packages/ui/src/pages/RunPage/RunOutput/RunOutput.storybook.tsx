import { act, useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import type { RunPhase, RunToolStatus } from "@comma-agents/daemon";
import {
  expect,
  fireEvent,
  fn,
  userEvent,
  waitFor,
  within,
} from "storybook/test";
import type { RunChild, RunMessage } from "../../../hooks/runs";
import { RunFeedContext } from "../../../hooks/runs/RunProvider/RunProvider.context";
import { AppProviders, openSocket, prepareStory } from "../../../test.utils";
import {
  acknowledgeSubscription,
  deliver,
  runSnapshot,
} from "../../../hooks/useCommaAgentsDaemon/test.utils";
import { RunOutput, RunOutputRender } from "./RunOutput";
import styles from "../RunPage.module.scss";

const createdAt = "2026-11-01T12:00:00Z";
const user: RunMessage = {
  role: "user",
  id: "user-1",
  createdAt,
  streaming: false,
  content: [{ type: "text", text: "Review the run page's UI states." }],
};
const agent: RunMessage = {
  role: "agent",
  id: "agent-1",
  agentName: "Planner",
  createdAt,
  streaming: false,
  content: [
    {
      type: "text",
      text: "The composer needs **reply**, **steer**, and **continue** states.",
    },
  ],
};
const toolMessage: RunMessage = {
  ...agent,
  content: [
    {
      type: "tool",
      toolCallId: "delegate",
      toolName: "launch_strategy",
      arguments: { strategy: "Research" },
      status: "running" as RunToolStatus.running,
    },
  ],
};
const child: RunChild = {
  type: "child.run",
  messageId: "child-1",
  runId: "run-preview",
  childRunId: "research",
  sourceMessageId: agent.id,
  toolCallId: "delegate",
  strategyName: "Research",
  createdAt,
  phase: "running" as RunPhase.running,
};

const meta = {
  title: "Pages/RunPage/RunOutput",
  component: RunOutputRender,
  args: {
    messages: [user, agent],
    status: "completed",
    childRuns: [],
    onOpenChild: fn(),
    onCloseChild: fn(),
  },
  beforeEach: () => prepareStory(),
  decorators: [
    (Story) => (
      <AppProviders>
        <div
          className={styles.page}
          data-run-page="run-preview"
          style={{ height: "30rem", maxWidth: "52rem" }}
        >
          <Story />
        </div>
      </AppProviders>
    ),
  ],
} satisfies Meta<typeof RunOutputRender>;

// oxlint-disable-next-line import/no-default-export -- Storybook requires default metadata.
export default meta;
type Story = StoryObj<typeof meta>;

export const Loading: Story = { args: { messages: [], status: "loading" } };
export const Prepared: Story = { args: { messages: [], status: "prepared" } };
export const Running: Story = {
  beforeEach: () => {
    const restore = prepareStory();
    const previousNow = Date.now;
    Date.now = () => Date.parse(createdAt) + 2000;
    return () => {
      Date.now = previousNow;
      restore();
    };
  },
  args: { status: "running", messages: [user, { ...agent, streaming: true }] },
};
export const WaitingForInput: Story = {
  args: { status: "running", waitingForInput: true },
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).getByRole("status"),
    ).toBeEmptyDOMElement();
  },
};
export const Completed: Story = {
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole("status")).toHaveTextContent(
      "Done.",
    );
  },
};
export const Stopped: Story = {
  args: {
    status: "stopped",
    messages: [user, { ...agent, interruption: "stopped" }],
  },
};
export const Failed: Story = {
  args: { status: "failed", error: "The model provider disconnected." },
};
export const FailedWithoutDetails: Story = {
  args: { status: "failed", waitingForInput: true },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole("alert")).toHaveTextContent(
      "Run failed.",
    );
  },
};
export const EmptyCompletedRun: Story = { args: { messages: [] } };
export const StrategyTransition: Story = {
  args: {
    messages: [
      user,
      agent,
      {
        role: "strategy",
        id: "switch",
        createdAt,
        streaming: false,
        content: [{ type: "text", text: "Switched to Review." }],
      },
      { ...agent, id: "reviewer", agentName: "Reviewer" },
    ],
  },
};
export const DelegatedJobs: Story = {
  args: {
    messages: [user, toolMessage],
    status: "running",
    childRuns: [child],
  },
  play: async ({ canvasElement, args }) => {
    await userEvent.click(
      within(canvasElement).getByRole("button", { name: "Open Research" }),
    );
    await expect(args.onOpenChild).toHaveBeenCalledWith(child);
  },
};
export const SelectedSubagent: Story = {
  args: { ...DelegatedJobs.args, selectedChild: child },
  play: async ({ canvasElement }) => {
    const socket = await openSocket();
    const subscription = await acknowledgeSubscription(socket, "runs");
    await expect(subscription.arguments).toEqual({ runId: child.childRunId });
    await act(() =>
      deliver(socket, subscription.requestId, {
        type: "run.state",
        data: runSnapshot("research", "running"),
      }),
    );
    const dialog = within(canvasElement).getByRole("dialog", {
      name: "Subagent: Research",
    });
    await expect(within(dialog).getByRole("status")).toHaveTextContent(
      "Working...",
    );
  },
};
export const NestedSubagents: Story = {
  render: () => (
    <RunFeedContext.Provider
      value={{
        messages: [user, toolMessage],
        status: "running",
        children: [child],
        pendingInputs: [],
        activeAgents: [],
        initialized: true,
      }}
    >
      <RunOutput />
    </RunFeedContext.Provider>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const socket = await openSocket();
    await userEvent.click(
      canvas.getByRole("button", { name: "Open Research" }),
    );
    const research = await acknowledgeSubscription(socket, "runs");
    await act(() =>
      deliver(socket, research.requestId, {
        type: "run.initial",
        data: {
          snapshot: runSnapshot("research", "running"),
          pendingInputs: [],
          history: {
            entries: [
              {
                type: "message",
                role: "agent",
                agentName: "Researcher",
                messageId: "research-message",
                runId: "research",
                createdAt,
                status: "completed",
                content: [
                  {
                    type: "tool",
                    toolCallId: "nested-tool",
                    toolName: "launch_strategy",
                    arguments: {},
                    status: "running",
                  },
                ],
              },
            ],
            page: { hasMore: false },
          },
        },
      }),
    );
    await act(() =>
      deliver(socket, research.requestId, {
        type: "child.run",
        data: {
          ...child,
          runId: "research",
          childRunId: "review",
          messageId: "nested",
          sourceMessageId: "research-message",
          toolCallId: "nested-tool",
          strategyName: "Review",
        },
      }),
    );
    await userEvent.click(
      within(canvas.getByRole("dialog")).getByRole("button", {
        name: "Open Review",
      }),
    );
    await expect(
      canvas.getByRole("dialog", { name: "Subagent: Review" }),
    ).toBeVisible();
    await userEvent.click(canvas.getByRole("button", { name: "Back" }));
    await expect(
      canvas.getByRole("dialog", { name: "Subagent: Research" }),
    ).toBeVisible();
    await expect(
      canvas.queryByRole("button", { name: "Back" }),
    ).not.toBeInTheDocument();
    await userEvent.click(canvas.getByRole("button", { name: "Close dialog" }));
    await expect(canvas.queryByRole("dialog")).not.toBeInTheDocument();
    await expect(
      canvas.getByText("Review the run page's UI states."),
    ).toBeVisible();
  },
};

function StreamingOutput({
  onOpenChild,
}: {
  readonly onOpenChild: (child: RunChild) => void;
}) {
  const [count, setCount] = useState(20);
  return (
    <>
      <button onClick={() => setCount((previous) => previous + 1)}>
        Receive message
      </button>
      <RunOutputRender
        messages={Array.from({ length: count }, (_, index) => ({
          ...agent,
          id: `message-${index}`,
          content: [
            {
              type: "text",
              text: `Finding ${index + 1}: ${"Review the run page states. ".repeat(8)}`,
            },
          ],
        }))}
        status="running"
        childRuns={[]}
        onOpenChild={onOpenChild}
        onCloseChild={fn()}
      />
    </>
  );
}
export const FollowsNewMessages: Story = {
  render: (args) => <StreamingOutput onOpenChild={args.onOpenChild} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const output = canvas.getByRole("group", { name: "Run output" });
    await waitFor(() =>
      expect(
        output.scrollHeight - output.scrollTop - output.clientHeight,
      ).toBeLessThan(2),
    );
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => resolve()),
    );
    await userEvent.click(
      canvas.getByRole("button", { name: "Receive message" }),
    );
    await waitFor(() =>
      expect(
        output.scrollHeight - output.scrollTop - output.clientHeight,
      ).toBeLessThan(2),
    );
    await expect(canvas.getByText(/^Finding 21:/)).toBeVisible();
  },
};
export const PreservesReaderScrollPosition: Story = {
  render: FollowsNewMessages.render,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const output = canvas.getByRole("group", { name: "Run output" });
    await waitFor(() => expect(output.scrollTop).toBeGreaterThan(0));
    output.scrollTop = 0;
    fireEvent.scroll(output);
    await userEvent.click(
      canvas.getByRole("button", { name: "Receive message" }),
    );
    await canvas.findByText(/^Finding 21:/);
    await expect(output.scrollTop).toBe(0);
  },
};
export const Narrow: Story = {
  decorators: [
    (Story) => (
      <div style={{ width: "20rem", maxWidth: "100%" }}>
        <Story />
      </div>
    ),
  ],
};
