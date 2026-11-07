import { act, useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fireEvent, userEvent, waitFor, within } from "storybook/test";
import { MemoryRouter, Route, Routes } from "react-router";
import {
  acknowledgeSubscription,
  answerCommand,
  deliver,
  requests,
  runSnapshot,
  streamedText,
} from "../../hooks/useCommaAgentsDaemon/test.utils";
import {
  AppProviders,
  answerStrategyLists,
  openSocket,
  prepareStory,
} from "../../test.utils";
import { RunPage } from "./RunPage";
import { ChatPaneContext } from "../../hooks/useChatPane";
import { useLayout } from "../../hooks/useLayout";
import { LayoutContext } from "../../hooks/useLayout/useLayout.context";

const completed = {
  status: "completed",
  summary: {
    finishReason: "stop",
    usage: { promptTokens: 1, completionTokens: 1 },
  },
};

const meta = {
  title: "Pages/RunPage",
  component: RunPage,
  render: () => (
    <AppProviders>
      <MemoryRouter initialEntries={["/runs/run-1"]}>
        <Routes>
          <Route path="/runs/:runId" element={<RunPage />} />
          <Route path="/" element={<p>New chat page</p>} />
        </Routes>
      </MemoryRouter>
    </AppProviders>
  ),
  beforeEach: () => prepareStory(),
  parameters: {
    layout: "fullscreen",
    docs: {
      description: {
        component:
          "Follows one run taken from the route: replays its history, then shows each message as its own section, with markdown, code, math, reasoning, and tool calls, as it streams.",
      },
    },
  },
} satisfies Meta<typeof RunPage>;

// oxlint-disable-next-line import/no-default-export -- Colocated Storybook stories require a default metadata export.
export default meta;
type Story = StoryObj<typeof meta>;

export const StreamsTheRun: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const socket = await openSocket();
    const subscription = await acknowledgeSubscription(socket, "runs");
    await expect(subscription.arguments).toEqual({ runId: "run-1" });
    await act(() =>
      deliver(socket, subscription.requestId, {
        type: "run.initial",
        data: {
          snapshot: runSnapshot("run-1", "running"),
          history: { entries: [], page: { hasMore: false } },
          pendingInputs: [],
        },
      }),
    );
    await expect(canvas.getByRole("status")).toHaveTextContent("Running...");
    await act(() =>
      deliver(socket, subscription.requestId, streamedText("run-1", "Hel")),
    );
    await act(() =>
      deliver(
        socket,
        subscription.requestId,
        streamedText("run-1", "Hello there"),
      ),
    );
    await expect(await canvas.findByText("Hello there")).toBeVisible();
    await act(() =>
      deliver(socket, subscription.requestId, {
        type: "run.state",
        data: runSnapshot("run-1", "terminal", { outcome: completed }),
      }),
    );
    await expect(canvas.getByText("assistant")).toBeVisible();
    await expect(canvas.getByRole("status")).toHaveTextContent("Done.");
  },
};
export const ShowsOutputThatArrivedBeforeSubscribing: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const socket = await openSocket();
    const subscription = await acknowledgeSubscription(socket, "runs");
    // A finished run replays its history when opened.
    await act(() =>
      deliver(socket, subscription.requestId, {
        type: "run.initial",
        data: {
          snapshot: runSnapshot("run-1", "terminal", { outcome: completed }),
          history: {
            entries: [
              {
                type: "message",
                messageId: "m1",
                runId: "run-1",
                createdAt: "2026-10-25T12:00:00.000Z",
                role: "agent",
                agentName: "assistant",
                status: "completed",
                content: [{ type: "text", text: "Already done." }],
              },
            ],
            page: { hasMore: false },
          },
          pendingInputs: [],
        },
      }),
    );
    await expect(await canvas.findByText("Already done.")).toBeVisible();
    await expect(canvas.getByRole("status")).toHaveTextContent("Done.");
  },
};
export const ShowsWhenARunFails: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const socket = await openSocket();
    const subscription = await acknowledgeSubscription(socket, "runs");
    await act(() =>
      deliver(socket, subscription.requestId, {
        type: "run.state",
        data: runSnapshot("run-1", "terminal", {
          outcome: {
            status: "failed",
            error: { code: "EXECUTION_ERROR", metadata: { runId: "run-1" } },
          },
        }),
      }),
    );
    await expect(canvas.getByRole("alert")).toHaveTextContent(
      "Run failed (EXECUTION_ERROR).",
    );
  },
};
export const OffersANewChatWhenTheRunIsMissing: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const socket = await openSocket();
    const subscription = await waitFor(() => {
      const found = requests(socket, "subscribe")
        .filter((candidate) => candidate.channel === "runs")
        .at(-1);
      if (!found) {
        throw new Error("Not subscribed to runs yet.");
      }
      return found;
    });
    await act(() =>
      deliver(socket, subscription.requestId, {
        type: "response",
        ok: false,
        error: { code: "RUN_NOT_FOUND", message: "Run not found" },
      }),
    );
    await expect(await canvas.findByRole("alert")).toHaveTextContent(
      "Run not found.",
    );
    await userEvent.click(canvas.getByRole("button", { name: "New chat" }));
    await expect(await canvas.findByText("New chat page")).toBeVisible();
  },
};

const mixedHistory = {
  type: "run.initial",
  data: {
    snapshot: runSnapshot("run-1", "terminal", { outcome: completed }),
    history: {
      entries: [
        {
          type: "message",
          messageId: "u1",
          runId: "run-1",
          createdAt: "2026-10-25T12:00:00.000Z",
          role: "user",
          status: "completed",
          content: [{ type: "text", text: "Sum the squares." }],
        },
        {
          type: "message",
          messageId: "a1",
          runId: "run-1",
          createdAt: "2026-10-25T12:00:01.000Z",
          role: "agent",
          agentName: "planner",
          status: "completed",
          content: [
            { type: "reasoning", text: "Squares first, then add." },
            {
              type: "tool",
              toolCallId: "t1",
              toolName: "run_command",
              status: "completed",
              arguments: { command: "echo 14" },
              output: { stdout: "14" },
            },
            {
              type: "text",
              text: "The sum is **14**, since \\(1^2 + 2^2 + 3^2 = 14\\).\n\n```ts\nconst total = 14;\n```",
            },
          ],
        },
        {
          type: "message",
          messageId: "a2",
          runId: "run-1",
          createdAt: "2026-10-25T12:00:02.000Z",
          role: "agent",
          agentName: "reviewer",
          status: "completed",
          content: [{ type: "text", text: "Checked." }],
        },
      ],
      page: { hasMore: false },
    },
    pendingInputs: [],
  },
};

export const SeparatesEachMessageByWhoProducedIt: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const socket = await openSocket();
    const subscription = await acknowledgeSubscription(socket, "runs");
    await act(() => deliver(socket, subscription.requestId, mixedHistory));
    await expect(canvas.getByRole("article", { name: "You" })).toBeVisible();
    await expect(
      canvas.getByRole("article", { name: "planner" }),
    ).toBeVisible();
    await expect(
      canvas.getByRole("article", { name: "reviewer" }),
    ).toBeVisible();
  },
};
export const FormatsMarkdownCodeAndMath: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const socket = await openSocket();
    const subscription = await acknowledgeSubscription(socket, "runs");
    await act(() => deliver(socket, subscription.requestId, mixedHistory));
    await expect(
      await canvas.findByText("14", { selector: "strong" }),
    ).toBeVisible();
    // Highlighting splits the code across spans, so compare its text as a whole.
    await waitFor(() =>
      expect(
        Array.from(canvasElement.querySelectorAll("pre code")).some((code) =>
          code.textContent?.includes("const total = 14;"),
        ),
      ).toBe(true),
    );
    // Closed tool calls hold copy buttons too; the answer's own comes last.
    await expect(
      (await canvas.findAllByRole("button", { name: "Copy" })).at(-1),
    ).toBeVisible();
    await waitFor(() =>
      expect(canvasElement.querySelector(".katex")).not.toBeNull(),
    );
  },
};
export const FoldsReasoningAndToolCalls: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const socket = await openSocket();
    const subscription = await acknowledgeSubscription(socket, "runs");
    await act(() => deliver(socket, subscription.requestId, mixedHistory));
    await expect(await canvas.findByText("Reasoning")).toBeVisible();
    await expect(canvas.getByText("run_command")).toBeVisible();
    await expect(
      canvas.getByText("Squares first, then add."),
    ).not.toBeVisible();
    await userEvent.click(canvas.getByText("run_command"));
    await expect(await canvas.findByText("Output")).toBeVisible();
  },
};

export const RepliesThenSteers: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const socket = await openSocket();
    const subscription = await acknowledgeSubscription(socket, "runs");
    await act(() =>
      deliver(socket, subscription.requestId, {
        type: "run.initial",
        data: {
          snapshot: runSnapshot("run-1", "running"),
          history: { entries: [], page: { hasMore: false } },
          pendingInputs: [
            {
              runId: "run-1",
              inputId: "input-1",
              agentName: "user",
              prompt: "Next question",
            },
          ],
          activeAgents: [],
        },
      }),
    );
    const input = canvas.getByRole("textbox", { name: "Message" });
    await userEvent.type(input, "My next question{Enter}");
    const reply = await answerCommand(socket, "runs.resolveInput", {
      type: "response",
      ok: true,
      data: null,
    });
    await expect(reply.arguments).toEqual({
      runId: "run-1",
      inputId: "input-1",
      text: "My next question",
    });
    await expect(input).toHaveValue("");
    await act(() => {
      deliver(socket, subscription.requestId, {
        type: "input.resolved",
        data: { runId: "run-1", inputId: "input-1" },
      });
      deliver(socket, subscription.requestId, {
        type: "agent.started",
        data: {
          runId: "run-1",
          messageId: "expert-1",
          agentName: "expert",
          createdAt: "2026-10-25T12:00:00.000Z",
        },
      });
    });
    await expect(input).toHaveAttribute("placeholder", "Steer the agent...");
    await userEvent.type(input, "Focus on the duplication{Enter}");
    const steering = await answerCommand(socket, "runs.steer", {
      type: "response",
      ok: true,
      data: null,
    });
    await expect(steering.arguments).toEqual({
      runId: "run-1",
      messageId: "expert-1",
      text: "Focus on the duplication",
    });
    await expect(input).toHaveValue("");
  },
};

export const PreservesFailedSubmission: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const socket = await openSocket();
    const subscription = await acknowledgeSubscription(socket, "runs");
    await act(() =>
      deliver(socket, subscription.requestId, {
        type: "run.initial",
        data: {
          snapshot: runSnapshot("run-1", "running"),
          history: { entries: [], page: { hasMore: false } },
          pendingInputs: [
            {
              runId: "run-1",
              inputId: "input-1",
              agentName: "user",
              prompt: "Next question",
            },
          ],
        },
      }),
    );
    const input = canvas.getByRole("textbox", { name: "Message" });
    await userEvent.type(input, "Keep my draft{Enter}");
    await expect(canvas.getByRole("button", { name: "Send" })).toBeDisabled();
    await answerCommand(socket, "runs.resolveInput", {
      type: "response",
      ok: false,
      error: {
        code: "INPUT_NOT_FOUND",
        message: "Input no longer pending.",
        metadata: { runId: "run-1", inputId: "input-1" },
      },
    });
    await expect(canvas.getByRole("alert")).toHaveTextContent(
      "Input no longer pending.",
    );
    await expect(input).toHaveValue("Keep my draft");
    await expect(input).toBeEnabled();
  },
};

export const SelectsConcurrentRecipient: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const socket = await openSocket();
    const subscription = await acknowledgeSubscription(socket, "runs");
    await act(() =>
      deliver(socket, subscription.requestId, {
        type: "run.initial",
        data: {
          snapshot: runSnapshot("run-1", "running"),
          history: { entries: [], page: { hasMore: false } },
          pendingInputs: [],
          activeAgents: ["writer", "reviewer"].map((agentName) => ({
            runId: "run-1",
            agentName,
            messageId: agentName,
            createdAt: "2026-10-25T12:00:00.000Z",
          })),
        },
      }),
    );
    const input = canvas.getByRole("textbox", { name: "Message" });
    await expect(input).toBeDisabled();
    await userEvent.selectOptions(
      canvas.getByRole("combobox", { name: "Steering recipient" }),
      "reviewer",
    );
    await userEvent.type(input, "Check the error path{Enter}");
    const steering = await answerCommand(socket, "runs.steer", {
      type: "response",
      ok: true,
      data: null,
    });
    await expect(steering.arguments).toMatchObject({
      messageId: "reviewer",
      text: "Check the error path",
    });
  },
};

export const RestoresSteeringInterruption: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const socket = await openSocket();
    const subscription = await acknowledgeSubscription(socket, "runs");
    await act(() =>
      deliver(socket, subscription.requestId, {
        type: "run.initial",
        data: {
          snapshot: runSnapshot("run-1", "terminal", { outcome: completed }),
          history: {
            entries: [
              {
                type: "message",
                runId: "run-1",
                messageId: "partial-1",
                agentName: "expert",
                createdAt: "2026-10-25T12:00:00.000Z",
                role: "agent",
                status: "stopped",
                cancellationReason: "user_steering",
                content: [
                  { type: "text", text: "The partial answer remains visible." },
                  {
                    type: "tool",
                    toolCallId: "tool-1",
                    toolName: "search_files",
                    arguments: {},
                    status: "stopped",
                    cancellationReason: "user_steering",
                    cancellationRequestedBy: "user_steering",
                  },
                  {
                    type: "tool",
                    toolCallId: "tool-2",
                    toolName: "read_file",
                    arguments: {},
                    status: "completed",
                    output: "Result",
                    cancellationRequestedBy: "user_steering",
                  },
                ],
              },
            ],
            page: { hasMore: false },
          },
          pendingInputs: [],
        },
      }),
    );
    await expect(
      canvas.getByText("The partial answer remains visible."),
    ).toBeVisible();
    await expect(canvas.getByText("Interrupted by steering")).toBeVisible();
    const tools = canvas.getByRole("button", { name: /2 tools/ });
    await expect(tools).toHaveAttribute("aria-expanded", "false");
    await expect(tools).toHaveTextContent("1 stopped");
    await userEvent.click(tools);
    await expect(canvas.getByText("Cancelled by steering")).toBeVisible();
    await expect(
      canvas.getByText("completed (cancellation requested)"),
    ).toBeVisible();
    await expect(
      canvas.getByRole("textbox", { name: "Message" }),
    ).toBeDisabled();
    await expect(
      canvas.getByRole("button", { name: "New chat" }),
    ).toBeVisible();
  },
};

function agentOutput(extra: Record<string, unknown>) {
  return {
    type: "agent.output",
    data: {
      type: "message",
      messageId: "m1",
      runId: "run-1",
      createdAt: "2026-10-25T12:00:00.000Z",
      role: "agent",
      agentName: "planner",
      content: [{ type: "text", text: "Done." }],
      ...extra,
    },
  };
}

export const ShowsModelTimeTokensAndContextOfAFinishedResponse: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const socket = await openSocket();
    const subscription = await acknowledgeSubscription(socket, "runs");
    await act(() =>
      deliver(
        socket,
        subscription.requestId,
        agentOutput({
          status: "completed",
          model: "openai/gpt-4o",
          contextWindow: 1000,
          completedAt: "2026-10-25T12:00:01.800Z",
          usage: { promptTokens: 900, completionTokens: 304 },
          contextUsage: { totalTokens: 800 },
        }),
      ),
    );
    await expect(await canvas.findByText("openai/gpt-4o")).toBeVisible();
    await expect(canvas.getByText("1.8s")).toBeVisible();
    await expect(canvas.getByText(/1,204\s+tok/)).toBeVisible();
    await expect(
      canvas.getByRole("meter", { name: "Context used" }),
    ).toHaveAttribute("aria-valuenow", "80");
  },
};
export const ShowsTheModelAndAnimatedStatusWhileStreaming: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const socket = await openSocket();
    const subscription = await acknowledgeSubscription(socket, "runs");
    await act(() =>
      deliver(socket, subscription.requestId, {
        type: "agent.stream",
        data: {
          runId: "run-1",
          messageId: "m1",
          agentName: "planner",
          createdAt: "2026-10-25T12:00:00.000Z",
          model: "openai/gpt-4o",
          contextWindow: 1000,
          contentIndex: 0,
          content: { type: "text", text: "Thinking" },
        },
      }),
    );
    await expect(await canvas.findByText("openai/gpt-4o")).toBeVisible();
    await expect(canvas.getByText("Streaming")).toBeVisible();
    await expect(canvas.queryByRole("meter")).toBeNull();
    await expect(canvas.queryByText(/tok$/)).toBeNull();
  },
};
export const TagsAStoppedResponseWithoutTokens: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const socket = await openSocket();
    const subscription = await acknowledgeSubscription(socket, "runs");
    await act(() =>
      deliver(
        socket,
        subscription.requestId,
        agentOutput({
          status: "stopped",
          model: "openai/gpt-4o",
          completedAt: "2026-10-25T12:00:00.500Z",
        }),
      ),
    );
    await expect(await canvas.findByText("stopped")).toBeVisible();
    await expect(canvas.getByText("500ms")).toBeVisible();
    await expect(canvas.queryByRole("meter")).toBeNull();
  },
};

export const FocusesTheInputSoTheConversationContinues: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const socket = await openSocket();
    const subscription = await acknowledgeSubscription(socket, "runs");
    await act(() =>
      deliver(socket, subscription.requestId, {
        type: "run.initial",
        data: {
          snapshot: runSnapshot("run-1", "running"),
          history: { entries: [], page: { hasMore: false } },
          pendingInputs: [],
          activeAgents: [
            {
              runId: "run-1",
              messageId: "expert-1",
              agentName: "expert",
              createdAt: "2026-10-25T12:00:00.000Z",
            },
          ],
        },
      }),
    );
    const input = canvas.getByRole("textbox", { name: "Message" });
    await waitFor(() => expect(input).toHaveFocus());
    await userEvent.type(input, "Focus on the duplication{Enter}");
    await answerCommand(socket, "runs.steer", {
      type: "response",
      ok: true,
      data: null,
    });
    await waitFor(() => expect(input).toHaveFocus());
    await expect(input).toHaveValue("");
  },
};
export const ShowsTheTypeBeforeTheName: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const socket = await openSocket();
    const subscription = await acknowledgeSubscription(socket, "runs");
    await act(() => deliver(socket, subscription.requestId, mixedHistory));
    const header = (await canvas.findByRole("article", { name: "planner" }))
      .firstElementChild?.nextElementSibling?.firstElementChild;
    await expect(header?.children[0]).toHaveTextContent("agent");
    await expect(header?.children[1]).toHaveTextContent("planner");
  },
};

const boundedRender = () => (
  <AppProviders>
    <MemoryRouter initialEntries={["/runs/run-1"]}>
      <div style={{ position: "relative", height: 320 }}>
        <Routes>
          <Route path="/runs/:runId" element={<RunPage />} />
        </Routes>
      </div>
    </MemoryRouter>
  </AppProviders>
);

const longHistory = {
  type: "run.initial",
  data: {
    snapshot: runSnapshot("run-1", "running"),
    history: {
      entries: Array.from({ length: 12 }, (_, index) => ({
        type: "message",
        messageId: `m${index}`,
        runId: "run-1",
        createdAt: "2026-10-25T12:00:00.000Z",
        role: "agent",
        agentName: "planner",
        status: "completed",
        content: [{ type: "text", text: `Message ${index}\n\nMore text.` }],
      })),
      page: { hasMore: false },
    },
    pendingInputs: [],
  },
};

function distanceFromBottom(list: HTMLElement) {
  return list.scrollHeight - list.scrollTop - list.clientHeight;
}

export const ScrollsInsteadOfShrinkingMessages: Story = {
  render: boundedRender,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const socket = await openSocket();
    const subscription = await acknowledgeSubscription(socket, "runs");
    await act(() => deliver(socket, subscription.requestId, longHistory));
    const list = await canvas.findByRole("group", { name: "Run output" });
    await waitFor(() =>
      expect(list.scrollHeight).toBeGreaterThan(list.clientHeight),
    );
    for (const section of canvas.getAllByRole("article")) {
      await expect(section.scrollHeight).toBeLessThanOrEqual(
        section.clientHeight,
      );
    }
    list.scrollTop = 0;
    await expect(list.scrollTop).toBe(0);
  },
};
export const FollowsNewContentWhileAtTheBottom: Story = {
  render: boundedRender,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const socket = await openSocket();
    const subscription = await acknowledgeSubscription(socket, "runs");
    await act(() => deliver(socket, subscription.requestId, longHistory));
    const list = await canvas.findByRole("group", { name: "Run output" });
    await waitFor(() =>
      expect(distanceFromBottom(list)).toBeLessThanOrEqual(1),
    );
    await act(() =>
      deliver(
        socket,
        subscription.requestId,
        streamedText("run-1", "Streaming line\n\n".repeat(20)),
      ),
    );
    await canvas.findByText("Streaming");
    await waitFor(() =>
      expect(distanceFromBottom(list)).toBeLessThanOrEqual(1),
    );
  },
};
export const LeavesTheScrollPositionOnceTheReaderScrollsUp: Story = {
  render: boundedRender,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const socket = await openSocket();
    const subscription = await acknowledgeSubscription(socket, "runs");
    await act(() => deliver(socket, subscription.requestId, longHistory));
    const list = await canvas.findByRole("group", { name: "Run output" });
    await waitFor(() =>
      expect(distanceFromBottom(list)).toBeLessThanOrEqual(1),
    );
    list.scrollTop = 0;
    // The scroll handler runs on the next frame.
    await waitFor(() => expect(list.scrollTop).toBe(0));
    await new Promise((resolve) => requestAnimationFrame(resolve));
    await act(() =>
      deliver(
        socket,
        subscription.requestId,
        streamedText("run-1", "Streaming line\n\n".repeat(20)),
      ),
    );
    await canvas.findByText("Streaming");
    await expect(list.scrollTop).toBe(0);
    list.scrollTop = list.scrollHeight;
    await new Promise((resolve) => requestAnimationFrame(resolve));
    await act(() =>
      deliver(
        socket,
        subscription.requestId,
        streamedText("run-1", "Streaming line\n\n".repeat(40)),
      ),
    );
    await waitFor(() =>
      expect(distanceFromBottom(list)).toBeLessThanOrEqual(1),
    );
  },
};

const switchStrategies = [
  {
    name: "Plan",
    label: "Plan",
    version: "1",
    path: "/work/strategy.json",
    origin: "cwd" as const,
  },
  {
    name: "Build",
    label: "Build",
    version: "1",
    path: "/work/build.json",
    origin: "cwd" as const,
  },
];

async function switchingFixture(running = false, available = switchStrategies) {
  const socket = await openSocket();
  const subscription = await acknowledgeSubscription(socket, "runs");
  await answerStrategyLists(socket, available);
  await act(() =>
    deliver(socket, subscription.requestId, {
      type: "run.initial",
      data: {
        snapshot: runSnapshot("run-1", running ? "running" : "terminal", {
          strategy: {
            name: "Plan",
            agents: ["planner"],
            flow: {
              name: "Plan",
              type: "sequential",
              steps: [{ agent: "planner" }],
            },
          },
          ...(running ? {} : { outcome: completed }),
        }),
        history: { entries: [], page: { hasMore: false } },
        pendingInputs: running
          ? [
              {
                runId: "run-1",
                inputId: "approval",
                agentName: "user",
                prompt: "Approve the plan?",
              },
            ]
          : [],
      },
    }),
  );
  return { socket, subscription };
}

async function generatingFixture() {
  const fixture = await switchingFixture();
  await act(() => {
    deliver(fixture.socket, fixture.subscription.requestId, {
      type: "run.state",
      data: runSnapshot("run-1", "running"),
    });
    deliver(fixture.socket, fixture.subscription.requestId, {
      type: "agent.started",
      data: {
        runId: "run-1",
        messageId: "m1",
        agentName: "planner",
        createdAt: "2026-10-25T12:00:00.000Z",
      },
    });
  });
  return fixture;
}

function buildSnapshot() {
  return runSnapshot("run-1", "prepared", {
    configuration: { strategyPath: "/work/build.json", cwd: "/work" },
    strategy: {
      name: "Build",
      agents: ["coder"],
      flow: { name: "Build", type: "sequential", steps: [{ agent: "coder" }] },
    },
    unmatchedAgents: [],
    strategyState: {
      revision: 1,
      handoff: { messages: [], eventOffset: 0 },
      changes: [
        {
          type: "strategy.changed",
          messageId: "switch-1",
          runId: "run-1",
          createdAt: "2026-10-25T12:01:00Z",
          revision: 1,
          previousName: "Plan",
          nextName: "Build",
          previousStrategyPath: "/work/strategy.json",
          nextStrategyPath: "/work/build.json",
        },
      ],
    },
  });
}

export const SwitchesStrategyBeforeTheNextMessage: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const { socket, subscription } = await switchingFixture();
    const input = canvas.getByRole("textbox", { name: "Message" });
    await expect(
      canvas
        .getByRole("group", { name: "Conversation strategy" })
        .getBoundingClientRect().bottom,
    ).toBeLessThanOrEqual(input.getBoundingClientRect().top);
    await userEvent.type(input, "Implement the plan");
    await userEvent.click(canvas.getByRole("button", { name: /^Strategy:/ }));
    await userEvent.click(canvas.getByRole("option", { name: /Build/ }));
    const selected = buildSnapshot();
    await act(() =>
      deliver(socket, subscription.requestId, {
        type: "run.state",
        data: selected,
      }),
    );
    const request = await answerCommand(socket, "runs.switchStrategy", {
      type: "response",
      ok: true,
      data: selected,
    });
    await expect(request.arguments).toMatchObject({
      runId: "run-1",
      strategyPath: "/work/build.json",
      stop: false,
      expectedRevision: 0,
    });
    await expect(input).toHaveValue("Implement the plan");
    await expect(
      canvas.getByText("Strategy changed: Plan → Build"),
    ).toBeVisible();
    await expect(
      requests(socket).some(
        (entry) =>
          entry.command === "runs.send" || entry.command === "runs.start",
      ),
    ).toBe(false);
    await userEvent.click(canvas.getByRole("button", { name: "Send" }));
    const sent = await answerCommand(socket, "runs.send", {
      type: "response",
      ok: true,
      data: { type: "started" },
    });
    await expect(sent.arguments).toMatchObject({
      runId: "run-1",
      input: "Implement the plan",
      expectedRevision: 1,
    });
    await expect(input).toHaveValue("");
  },
};

export const WaitDismissesWithoutQueuingASwitch: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const page = within(canvasElement.ownerDocument.body);
    const { socket, subscription } = await switchingFixture(true);
    await userEvent.click(canvas.getByRole("button", { name: /^Strategy:/ }));
    await userEvent.click(canvas.getByRole("option", { name: /Build/ }));
    const dialog = await page.findByRole("dialog", {
      name: "Switch strategy?",
    });
    await userEvent.click(within(dialog).getByRole("button", { name: "Wait" }));
    await expect(page.queryByRole("dialog")).toBeNull();
    await expect(
      requests(socket).some((entry) => entry.command === "runs.switchStrategy"),
    ).toBe(false);
    await userEvent.click(canvas.getByRole("button", { name: /^Strategy:/ }));
    await userEvent.click(canvas.getByRole("option", { name: /Build/ }));
    await userEvent.click(
      page.getByRole("button", { name: "Stop and switch" }),
    );
    await act(() =>
      deliver(socket, subscription.requestId, {
        type: "run.state",
        data: buildSnapshot(),
      }),
    );
    const request = await answerCommand(socket, "runs.switchStrategy", {
      type: "response",
      ok: true,
      data: buildSnapshot(),
    });
    await expect(request.arguments).toMatchObject({
      stop: true,
      strategyPath: "/work/build.json",
    });
    await expect(page.queryByRole("dialog")).toBeNull();
    await expect(
      canvas.getByRole("textbox", { name: "Message" }),
    ).toBeEnabled();
  },
};

export const FailedSwitchPreservesSelectionAndDraft: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const { socket } = await switchingFixture();
    const input = canvas.getByRole("textbox", { name: "Message" });
    await userEvent.type(input, "Keep this draft");
    await userEvent.click(canvas.getByRole("button", { name: /^Strategy:/ }));
    await userEvent.click(canvas.getByRole("option", { name: /Build/ }));
    await answerCommand(socket, "runs.switchStrategy", {
      type: "response",
      ok: false,
      error: {
        code: "PREPARATION_ERROR",
        message: "Build could not be loaded.",
        metadata: { runId: "run-1" },
      },
    });
    await expect(canvas.getByRole("alert")).toHaveTextContent(
      "Build could not be loaded.",
    );
    await expect(
      canvas.getByRole("button", { name: /^Strategy:/ }),
    ).toHaveTextContent("Plan");
    await expect(input).toHaveValue("Keep this draft");
    await expect(
      canvas.queryByText("Strategy changed: Plan → Build"),
    ).toBeNull();
  },
};

export const ContextChoicesPreserveTheDraftUntilAccepted: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const page = within(canvasElement.ownerDocument.body);
    const { socket } = await switchingFixture();
    const input = canvas.getByRole("textbox", { name: "Message" });
    await userEvent.type(input, "Implement this{Enter}");
    const overflow = {
      type: "context_required",
      estimatedTokens: 150000,
      tokenLimit: 128000,
      recentCount: 8,
    };
    await answerCommand(socket, "runs.send", {
      type: "response",
      ok: true,
      data: overflow,
    });
    await expect(
      await page.findByRole("dialog", { name: "Choose conversation context" }),
    ).toBeVisible();
    await expect(input).toHaveValue("Implement this");
    for (const [label, choice] of [
      ["Compact", "compact"],
      ["Send 8 recent messages", "recent"],
      ["Continue with full history", "full"],
    ]) {
      const before = requests(socket).filter(
        (entry) => entry.command === "runs.send",
      ).length;
      await userEvent.click(page.getByRole("button", { name: label }));
      await waitFor(() =>
        expect(
          requests(socket).filter((entry) => entry.command === "runs.send"),
        ).toHaveLength(before + 1),
      );
      const request = await answerCommand(socket, "runs.send", {
        type: "response",
        ok: true,
        data:
          choice === "full"
            ? { type: "started" }
            : { ...overflow, error: "Please choose another context option." },
      });
      await expect(request.arguments).toMatchObject({
        contextChoice: choice,
        input: "Implement this",
      });
      if (choice !== "full") {
        await expect(input).toHaveValue("Implement this");
      }
    }
    await expect(input).toHaveValue("");
    await expect(page.queryByRole("dialog")).toBeNull();
  },
};

export const ExecutionErrorPreservesDraftWithoutContextChoices: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const { socket } = await switchingFixture();
    const input = canvas.getByRole("textbox", { name: "Message" });
    await userEvent.type(input, "Keep my message{Enter}");
    await answerCommand(socket, "runs.send", {
      type: "response",
      ok: false,
      error: {
        code: "EXECUTION_ERROR",
        message: "Run execution failed",
        metadata: { runId: "run-1" },
      },
    });
    await expect(canvas.getByRole("alert")).toHaveTextContent(
      "Run execution failed",
    );
    await expect(input).toHaveValue("Keep my message");
    await expect(input).toBeEnabled();
    await expect(
      within(canvasElement.ownerDocument.body).queryByRole("dialog"),
    ).toBeNull();
  },
};

export const ExecutionErrorAfterContextChoiceDoesNotReopenTheDialog: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const page = within(canvasElement.ownerDocument.body);
    const { socket } = await switchingFixture();
    const input = canvas.getByRole("textbox", { name: "Message" });
    await userEvent.type(input, "Keep my message{Enter}");
    await answerCommand(socket, "runs.send", {
      type: "response",
      ok: true,
      data: {
        type: "context_required",
        estimatedTokens: 150000,
        tokenLimit: 128000,
        recentCount: 8,
      },
    });
    await userEvent.click(
      await page.findByRole("button", { name: "Continue with full history" }),
    );
    await waitFor(() =>
      expect(
        requests(socket).filter((request) => request.command === "runs.send"),
      ).toHaveLength(2),
    );
    await answerCommand(socket, "runs.send", {
      type: "response",
      ok: false,
      error: {
        code: "EXECUTION_ERROR",
        message: "Run execution failed",
        metadata: { runId: "run-1" },
      },
    });
    await expect(canvas.getByRole("alert")).toHaveTextContent(
      "Run execution failed",
    );
    await expect(input).toHaveValue("Keep my message");
    await expect(input).toBeEnabled();
    await expect(page.queryByRole("dialog")).toBeNull();
  },
};

export const MissingStrategyRequiresAnotherSelection: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await switchingFixture(false, [switchStrategies[1]!]);
    await expect(canvas.getByRole("alert")).toHaveTextContent(
      "Strategy unavailable: Plan",
    );
    await expect(
      canvas.getByRole("textbox", { name: "Message" }),
    ).toBeDisabled();
    await expect(
      canvas.getByRole("button", { name: /^Strategy:/ }),
    ).toBeEnabled();
  },
};

export const StopsTheRunWithoutSendingOrClearingTheDraft: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const { socket, subscription } = await generatingFixture();
    const input = canvas.getByRole("textbox", { name: "Message" });
    await userEvent.type(input, "Keep this draft");
    await userEvent.click(canvas.getByRole("button", { name: "Stop" }));
    await expect(
      canvas.getByRole("button", { name: "Stopping…" }),
    ).toBeDisabled();
    const request = await answerCommand(socket, "runs.stop", {
      type: "response",
      ok: true,
      data: null,
    });
    await expect(request.arguments).toEqual({ runId: "run-1" });
    await act(() =>
      deliver(socket, subscription.requestId, {
        type: "run.state",
        data: runSnapshot("run-1", "terminal", {
          outcome: { status: "stopped" },
        }),
      }),
    );
    await expect(canvas.getByRole("status")).toHaveTextContent("Stopped.");
    await expect(input).toHaveValue("Keep this draft");
    await expect(canvas.queryByRole("button", { name: "Stop" })).toBeNull();
    await expect(
      requests(socket).filter((entry) => entry.command === "runs.stop"),
    ).toHaveLength(1);
    await expect(
      requests(socket).some((entry) =>
        ["runs.send", "runs.resolveInput", "runs.steer"].includes(
          entry.command ?? "",
        ),
      ),
    ).toBe(false);
  },
};

export const UserInputStepsHaveNoStopAction: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const { socket } = await switchingFixture(true);
    const input = canvas.getByRole("textbox", { name: "Message" });
    await userEvent.type(input, "My reply{Escape}{Escape}");
    await expect(canvas.queryByRole("button", { name: "Stop" })).toBeNull();
    await expect(canvas.getByRole("button", { name: "Send" })).toBeEnabled();
    await expect(input).toHaveValue("My reply");
    await expect(
      requests(socket).some((entry) => entry.command === "runs.stop"),
    ).toBe(false);
  },
};

export const StopDisappearsWhenTheAgentFinishesAndWaitsForTheUser: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const { socket, subscription } = await generatingFixture();
    await expect(canvas.getByRole("button", { name: "Stop" })).toBeVisible();
    await act(() => {
      deliver(
        socket,
        subscription.requestId,
        agentOutput({ status: "completed" }),
      );
      deliver(socket, subscription.requestId, {
        type: "input.requested",
        data: {
          runId: "run-1",
          inputId: "approval",
          agentName: "user",
          prompt: "Approve the plan?",
        },
      });
    });
    await expect(canvas.queryByRole("button", { name: "Stop" })).toBeNull();
    await userEvent.click(canvas.getByRole("textbox", { name: "Message" }));
    await userEvent.keyboard("{Escape}{Escape}");
    await expect(
      requests(socket).some((entry) => entry.command === "runs.stop"),
    ).toBe(false);
  },
};

export const DoubleEscapeStopsButHoldingEscapeDoesNot: Story = {
  render: boundedRender,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const { socket } = await generatingFixture();
    const input = canvas.getByRole("textbox", { name: "Message" });
    await userEvent.type(input, "Unsent draft");
    await userEvent.keyboard("{Escape}");
    const hint = await canvas.findByText(
      "Press Escape again to stop this chat.",
    );
    const stop = canvas.getByRole("button", { name: "Stop" });
    await expect(stop).toHaveAccessibleDescription(
      "Press Escape again to stop this chat.",
    );
    await waitFor(() => {
      expect(hint.getBoundingClientRect().bottom).toBeLessThanOrEqual(
        stop.getBoundingClientRect().top - 7,
      );
    });
    await fireEvent.keyDown(input, { key: "Escape", repeat: true });
    await expect(
      requests(socket).some((entry) => entry.command === "runs.stop"),
    ).toBe(false);
    await userEvent.keyboard("{Escape}");
    await answerCommand(socket, "runs.stop", {
      type: "response",
      ok: true,
      data: null,
    });
    await expect(
      canvas.queryByText("Press Escape again to stop this chat."),
    ).toBeNull();
    await expect(
      requests(socket).filter((entry) => entry.command === "runs.stop"),
    ).toHaveLength(1);
    await expect(input).toHaveValue("Unsent draft");
  },
};

export const EscapePairExpiresAndResetsAfterTyping: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const { socket } = await generatingFixture();
    await userEvent.click(canvas.getByRole("textbox", { name: "Message" }));
    await userEvent.keyboard("{Escape}");
    await expect(
      canvas.getByText("Press Escape again to stop this chat."),
    ).toBeVisible();
    await new Promise((resolve) => setTimeout(resolve, 1550));
    await expect(
      canvas.queryByText("Press Escape again to stop this chat."),
    ).toBeNull();
    await userEvent.keyboard("{Escape}");
    await expect(
      requests(socket).some((entry) => entry.command === "runs.stop"),
    ).toBe(false);
    await userEvent.keyboard("x{Escape}");
    await expect(
      requests(socket).some((entry) => entry.command === "runs.stop"),
    ).toBe(false);
    await userEvent.keyboard("{Escape}");
    await answerCommand(socket, "runs.stop", {
      type: "response",
      ok: true,
      data: null,
    });
  },
};

export const DoubleEscapeWorksWhenFocusFallsBackToTheBody: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const { socket } = await generatingFixture();
    await act(() => canvas.getByRole("textbox", { name: "Message" }).blur());
    await expect(canvasElement.ownerDocument.activeElement).toBe(
      canvasElement.ownerDocument.body,
    );
    await userEvent.keyboard("{Escape}");
    await expect(
      canvas.getByText("Press Escape again to stop this chat."),
    ).toBeVisible();
    await userEvent.keyboard("{Escape}");
    await answerCommand(socket, "runs.stop", {
      type: "response",
      ok: true,
      data: null,
    });
    await expect(
      requests(socket).filter((entry) => entry.command === "runs.stop"),
    ).toHaveLength(1);
  },
};

function ActiveCancellationPanes() {
  const layout = useLayout();
  const [activeId, setActiveId] = useState("left");
  return (
    <LayoutContext.Provider
      value={{ ...layout, layout: { ...layout.layout, activeId } }}
    >
      <button onClick={() => setActiveId("left")}>Activate left pane</button>
      <button onClick={() => setActiveId("right")}>Activate right pane</button>
      {["left", "right"].map((paneId) => (
        <ChatPaneContext.Provider key={paneId} value={{ paneId }}>
          <section aria-label={`${paneId} pane`}>
            <MemoryRouter initialEntries={[`/runs/${paneId}`]}>
              <Routes>
                <Route path="/runs/:runId" element={<RunPage />} />
              </Routes>
            </MemoryRouter>
          </section>
        </ChatPaneContext.Provider>
      ))}
    </LayoutContext.Provider>
  );
}

export const EscapeHintAndStopFollowOnlyTheActivePane: Story = {
  render: () => (
    <AppProviders>
      <ActiveCancellationPanes />
    </AppProviders>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const socket = await openSocket();
    await answerStrategyLists(socket, switchStrategies);
    await waitFor(() =>
      expect(
        requests(socket, "subscribe").filter(
          (entry) => entry.channel === "runs",
        ),
      ).toHaveLength(2),
    );
    for (const subscription of requests(socket, "subscribe").filter(
      (entry) => entry.channel === "runs",
    )) {
      const runId = subscription.arguments!.runId as string;
      await act(() => {
        deliver(socket, subscription.requestId, {
          type: "response",
          ok: true,
          data: null,
        });
        deliver(socket, subscription.requestId, {
          type: "run.initial",
          data: {
            snapshot: runSnapshot(runId, "running"),
            history: { entries: [], page: { hasMore: false } },
            pendingInputs: [],
            activeAgents: [
              {
                runId,
                messageId: `${runId}-agent`,
                agentName: "assistant",
                createdAt: "2026-10-25T12:00:00.000Z",
              },
            ],
          },
        });
      });
    }
    const left = within(canvas.getByRole("region", { name: "left pane" }));
    const right = within(canvas.getByRole("region", { name: "right pane" }));
    await userEvent.click(left.getByRole("textbox", { name: "Message" }));
    await userEvent.keyboard("{Escape}");
    await expect(
      left.getByText("Press Escape again to stop this chat."),
    ).toBeVisible();
    await expect(
      right.queryByText("Press Escape again to stop this chat."),
    ).toBeNull();
    await userEvent.click(
      canvas.getByRole("button", { name: "Activate right pane" }),
    );
    await expect(
      left.queryByText("Press Escape again to stop this chat."),
    ).toBeNull();
    await userEvent.keyboard("{Escape}");
    await expect(
      right.getByText("Press Escape again to stop this chat."),
    ).toBeVisible();
    await userEvent.keyboard("{Escape}");
    const stopped = await answerCommand(socket, "runs.stop", {
      type: "response",
      ok: true,
      data: null,
    });
    await expect(stopped.arguments).toEqual({ runId: "right" });
    await expect(
      requests(socket).filter((entry) => entry.command === "runs.stop"),
    ).toHaveLength(1);
  },
};

export const SelectorEscapeDoesNotCountTowardsStopping: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const { socket } = await generatingFixture();
    await userEvent.click(canvas.getByRole("button", { name: /^Strategy:/ }));
    await userEvent.keyboard("{Escape}{Escape}");
    await expect(canvas.queryByRole("dialog", { name: "Strategy" })).toBeNull();
    await expect(
      requests(socket).some((entry) => entry.command === "runs.stop"),
    ).toBe(false);
    await userEvent.keyboard("{Escape}");
    await answerCommand(socket, "runs.stop", {
      type: "response",
      ok: true,
      data: null,
    });
  },
};

export const StoppingAnUnacceptedSubmissionDoesNotReopenContextChoices: Story =
  {
    play: async ({ canvasElement }) => {
      const canvas = within(canvasElement);
      const { socket, subscription } = await switchingFixture();
      const input = canvas.getByRole("textbox", { name: "Message" });
      await userEvent.type(input, "Wait for the model{Enter}");
      await waitFor(() =>
        expect(
          requests(socket).some((entry) => entry.command === "runs.send"),
        ).toBe(true),
      );
      await act(() =>
        deliver(socket, subscription.requestId, {
          type: "run.state",
          data: runSnapshot("run-1", "running"),
        }),
      );
      await act(() =>
        deliver(socket, subscription.requestId, {
          type: "agent.started",
          data: {
            runId: "run-1",
            messageId: "m1",
            agentName: "planner",
            createdAt: "2026-10-25T12:00:00.000Z",
          },
        }),
      );
      await waitFor(() =>
        expect(canvas.getByRole("button", { name: "Stop" })).toHaveFocus(),
      );
      await userEvent.keyboard("{Escape}{Escape}");
      await answerCommand(socket, "runs.stop", {
        type: "response",
        ok: true,
        data: null,
      });
      await act(() =>
        deliver(socket, subscription.requestId, {
          type: "run.state",
          data: runSnapshot("run-1", "terminal", {
            outcome: { status: "stopped" },
          }),
        }),
      );
      await answerCommand(socket, "runs.send", {
        type: "response",
        ok: true,
        data: {
          type: "context_required",
          estimatedTokens: 100,
          recentCount: 0,
          error: "Stopped before the model accepted the request.",
        },
      });
      await expect(input).toHaveValue("Wait for the model");
      await expect(
        within(canvasElement.ownerDocument.body).queryByRole("dialog"),
      ).toBeNull();
      await expect(canvas.getByRole("alert")).toHaveTextContent(
        "Message preserved after the stop request.",
      );
    },
  };
