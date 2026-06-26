import { beforeEach, describe, expect, it, mock } from "bun:test";
import { Text } from "ink";
import { render } from "ink-testing-library";
import React, { act as reactAct } from "react";

import type { ChatRunsContextType, UseChatState } from "./useChat.types";
import type { ChatRunLifecycle } from "./useChatRunLifecycle";

/** Captured subscription callbacks keyed by event type. */
let subscriptionHandlers: Record<string, (message: unknown) => void> = {};

/** Mock for useDaemonCommand — returns a mock sender per command type. */
const mockPrepareRunCommand = mock<
  (payload: Record<string, unknown>) => string | null
>(() => "req-1");
const mockStartRunCommand = mock<
  (payload: Record<string, unknown>) => string | null
>(() => "req-start");
const mockContinueRunCommand = mock<
  (payload: Record<string, unknown>) => string | null
>(() => "req-continue");
const mockSendUserInputCommand = mock<
  (payload: Record<string, unknown>) => string | null
>(() => "req-2");
const mockStopRunCommand = mock<
  (payload: Record<string, unknown>) => string | null
>(() => "req-3");
const mockListRunsCommand = mock<
  (payload: Record<string, unknown>) => string | null
>(() => "req-list");

mock.module("../useDaemon/useDaemon", () => ({
  useDaemon: () => ({
    status: "connected",
    send: mock(() => true),
    on: mock(() => () => {}),
    off: mock(() => {}),
  }),
}));

mock.module("../useDaemon/useDaemonCommand/useDaemonCommand", () => ({
  useDaemonCommand: (type: string) => {
    if (type === "prepare_run") return mockPrepareRunCommand;
    if (type === "start_run") return mockStartRunCommand;
    if (type === "continue_run") return mockContinueRunCommand;
    if (type === "user_input") return mockSendUserInputCommand;
    if (type === "stop_run") return mockStopRunCommand;
    if (type === "list_runs") return mockListRunsCommand;
    return mock(() => null);
  },
}));

mock.module("../useDaemon/useDaemonSubscription/useDaemonSubscription", () => ({
  useDaemonSubscription: (
    type: string,
    callback: (message: unknown) => void,
  ) => {
    subscriptionHandlers[type] = callback;
  },
}));

// Import after mocks are set up
const { useChat } = await import("./useChat");
const { useChatRuns } = await import("./useChatRuns");
const { useChatRunLifecycle } = await import("./useChatRunLifecycle");
const { ChatRunsContextProvider } = await import("./useChat.context");

function act(callback: () => void): void {
  const globalState = globalThis as Record<string, unknown>;
  const previousActEnvironment = globalState.IS_REACT_ACT_ENVIRONMENT;
  globalState.IS_REACT_ACT_ENVIRONMENT = true;
  try {
    reactAct(callback);
  } finally {
    globalState.IS_REACT_ACT_ENVIRONMENT = previousActEnvironment;
  }
}

/**
 * Render a component that observes `useChat` bound to an explicit run id.
 * Returns a mutable ref exposing the latest hook state plus a cleanup fn.
 */
function renderChatHook(): {
  result: { current: UseChatState };
  chatRuns: { current: ChatRunsContextType };
  runLifecycle: { current: ChatRunLifecycle };
  cleanup: () => void;
} {
  const resultRef: { current: UseChatState } = {} as { current: UseChatState };
  const sessionsRef: { current: ChatRunsContextType } = {} as {
    current: ChatRunsContextType;
  };
  const runLifecycleRef: { current: ChatRunLifecycle } = {} as {
    current: ChatRunLifecycle;
  };
  function TestComponent(): React.ReactElement {
    const [chatRunId, setChatRunId] = React.useState<string | null>(null);
    const chat = useChat(chatRunId);
    const runLifecycle = useChatRunLifecycle();
    const startStrategy = React.useCallback<UseChatState["startStrategy"]>(
      (...args) => {
        const nextChatRunId = runLifecycle.startStrategy(...args);
        setChatRunId(nextChatRunId);
        return nextChatRunId;
      },
      [runLifecycle.startStrategy],
    );

    resultRef.current = { ...chat, startStrategy };
    sessionsRef.current = useChatRuns();
    runLifecycleRef.current = runLifecycle;
    return React.createElement(Text, null, "test");
  }

  const instance = render(
    React.createElement(
      ChatRunsContextProvider,
      null,
      React.createElement(TestComponent),
    ),
  );

  return {
    result: resultRef,
    chatRuns: sessionsRef,
    runLifecycle: runLifecycleRef,
    cleanup: () => instance.unmount(),
  };
}

function expectUniqueMessageIds(messages: UseChatState["messages"]): void {
  expect(new Set(messages.map((message) => message.id)).size).toBe(
    messages.length,
  );
}

beforeEach(() => {
  subscriptionHandlers = {};
  mockPrepareRunCommand.mockClear();
  mockStartRunCommand.mockClear();
  mockContinueRunCommand.mockClear();
  mockSendUserInputCommand.mockClear();
  mockStopRunCommand.mockClear();
  mockListRunsCommand.mockClear();
  mockPrepareRunCommand.mockReturnValue("req-1");
  mockStartRunCommand.mockReturnValue("req-start");
  mockContinueRunCommand.mockReturnValue("req-continue");
  mockListRunsCommand.mockReturnValue("req-list");
});

describe("useChat", () => {
  it("should start with no bound run and empty state", () => {
    const { result, cleanup } = renderChatHook();

    expect(result.current.chatRunId).toBeNull();
    expect(result.current.status).toBe("idle");
    expect(result.current.messages).toEqual([]);
    expect(result.current.error).toBeNull();
    expect(result.current.pendingInputAgent).toBeNull();
    expect(result.current.runId).toBeNull();
    expect(result.current.connectionStatus).toBe("connected");

    cleanup();
  });

  describe("startStrategy", () => {
    it("should create and bind a run, then call the daemon command", () => {
      const { result, cleanup } = renderChatHook();

      act(() => {
        result.current.startStrategy("/path/to/strategy.json", "hello");
      });

      expect(result.current.chatRunId).not.toBeNull();
      expect(result.current.status).toBe("pending");
      expect(result.current.error).toBeNull();
      expect(result.current.messages).toHaveLength(1);
      expect(result.current.messages[0]?.role).toBe("user");
      expect(result.current.messages[0]?.text).toBe("hello");
      expect(mockPrepareRunCommand).toHaveBeenCalledWith({
        runId: result.current.chatRunId,
        strategyPath: "/path/to/strategy.json",
      });

      cleanup();
    });

    it("should send command without input when input is omitted", () => {
      const { result, cleanup } = renderChatHook();

      act(() => {
        result.current.startStrategy("/path/to/strategy.json");
      });

      expect(mockPrepareRunCommand).toHaveBeenCalledWith({
        runId: result.current.chatRunId,
        strategyPath: "/path/to/strategy.json",
      });

      cleanup();
    });

    it("should pass a selected persisted run's cwd into the normal start command", () => {
      const { result, cleanup } = renderChatHook();

      act(() => {
        result.current.startStrategy(
          "/path/to/strategy.json",
          undefined,
          "/repo",
        );
      });

      expect(mockPrepareRunCommand).toHaveBeenCalledWith({
        runId: result.current.chatRunId,
        strategyPath: "/path/to/strategy.json",
        cwd: "/repo",
      });

      cleanup();
    });

    it("should set error status when daemon command returns null", () => {
      mockPrepareRunCommand.mockReturnValue(null);
      const { result, cleanup } = renderChatHook();

      act(() => {
        result.current.startStrategy("/path/to/strategy.json");
      });

      expect(result.current.status).toBe("error");
      expect(result.current.error).toContain("Cannot reach daemon");

      cleanup();
    });
  });

  describe("loadPersistedRun", () => {
    it("should prepare the existing run id and hydrate from run_prepared", () => {
      const { chatRuns, runLifecycle, cleanup } = renderChatHook();

      act(() => {
        runLifecycle.current.loadPersistedRun({
          runId: "persisted-run",
          cwd: "/repo",
          strategyName: "plan",
          strategyPath: "/plan.json",
          startedAt: "2026-01-01T00:00:00.000Z",
          completedAt: "2026-01-01T00:01:00.000Z",
          status: "completed",
        });
      });

      expect(mockPrepareRunCommand).toHaveBeenCalledWith({
        runId: "persisted-run",
      });
      expect(mockStartRunCommand).toHaveBeenCalledTimes(0);
      expect(mockContinueRunCommand).toHaveBeenCalledTimes(0);

      act(() => {
        subscriptionHandlers.run_prepared?.({
          runId: "persisted-run",
          strategyName: "plan",
          agents: ["assistant"],
          flowTree: {},
          conversation: {
            records: [
              {
                id: "record-1",
                agentName: "assistant",
                createdAt: "2026-01-01T00:00:30.000Z",
                userMessage: { role: "user", content: "draft it" },
                responseMessages: [{ role: "assistant", content: "drafted" }],
                text: "drafted",
                usage: { promptTokens: 100, completionTokens: 25 },
                contextUsage: { totalTokens: 125 },
                finishReason: "stop",
              },
            ],
            retentionEvents: [],
            inputs: [{ text: "draft it", beforeRecordId: "record-1" }],
          },
        });
      });

      const hydratedRun = chatRuns.current.chatRuns.get("persisted-run");
      expect(hydratedRun?.messages).toHaveLength(2);
      expect(hydratedRun?.messages[0]).toMatchObject({
        role: "user",
        text: "draft it",
      });
      expect(hydratedRun?.messages[1]).toMatchObject({
        role: "agent",
        sender: "assistant",
        text: "drafted",
        usage: { promptTokens: 100, completionTokens: 25 },
        contextUsage: { totalTokens: 125 },
      });
      expect(mockStartRunCommand).toHaveBeenCalledTimes(0);
      expect(mockContinueRunCommand).toHaveBeenCalledTimes(0);

      cleanup();
    });

    it("rehydrates a sequential multi-agent run without duplicate or mislabeled bubbles", () => {
      const { chatRuns, runLifecycle, cleanup } = renderChatHook();

      act(() => {
        runLifecycle.current.loadPersistedRun({
          runId: "pipeline-run",
          cwd: "/repo",
          strategyName: "pipeline",
          strategyPath: "/pipeline.json",
          startedAt: "2026-01-01T00:00:00.000Z",
          completedAt: "2026-01-01T00:01:00.000Z",
          status: "completed",
        });
      });

      act(() => {
        subscriptionHandlers.run_prepared?.({
          runId: "pipeline-run",
          strategyName: "pipeline",
          agents: ["writer", "reviewer"],
          flowTree: {},
          conversation: {
            // In a sequential flow, the reviewer's userMessage is the writer's
            // output. The renderer must not project that as a "you" bubble.
            records: [
              {
                id: "record-writer",
                agentName: "writer",
                createdAt: "2026-01-01T00:00:30.000Z",
                userMessage: { role: "user", content: "human prompt" },
                responseMessages: [
                  { role: "assistant", content: "writer out" },
                ],
                text: "writer out",
                usage: { promptTokens: 10, completionTokens: 5 },
                finishReason: "stop",
              },
              {
                id: "record-reviewer",
                agentName: "reviewer",
                createdAt: "2026-01-01T00:00:45.000Z",
                userMessage: { role: "user", content: "writer out" },
                responseMessages: [
                  { role: "assistant", content: "reviewer out" },
                ],
                text: "reviewer out",
                usage: { promptTokens: 12, completionTokens: 6 },
                finishReason: "stop",
              },
            ],
            retentionEvents: [],
            inputs: [{ text: "human prompt", beforeRecordId: "record-writer" }],
          },
        });
      });

      const hydratedRun = chatRuns.current.chatRuns.get("pipeline-run");
      // Exactly: one human bubble, then one bubble per agent — no echoed input.
      expect(hydratedRun?.messages).toHaveLength(3);
      expect(hydratedRun?.messages[0]).toMatchObject({
        role: "user",
        sender: "you",
        text: "human prompt",
      });
      expect(hydratedRun?.messages[1]).toMatchObject({
        role: "agent",
        sender: "writer",
        text: "writer out",
      });
      expect(hydratedRun?.messages[2]).toMatchObject({
        role: "agent",
        sender: "reviewer",
        text: "reviewer out",
      });
      // The writer's output must never appear as a user-labeled bubble.
      const userBubbles = (hydratedRun?.messages ?? []).filter(
        (chatMessage) => chatMessage.role === "user",
      );
      expect(userBubbles).toHaveLength(1);
      expect(
        userBubbles.some((chatMessage) => chatMessage.text === "writer out"),
      ).toBe(false);

      cleanup();
    });
  });

  describe("strategy_started subscription", () => {
    it("should start a prepared run and bind metadata before strategy_started", () => {
      const { result, cleanup } = renderChatHook();

      act(() => {
        result.current.startStrategy("/path/to/strategy.json", "hello");
      });
      const runId = result.current.chatRunId!;

      act(() => {
        subscriptionHandlers.run_prepared?.({
          runId,
          strategyName: "test-strategy",
          agents: ["agent-a", "agent-b"],
          flowTree: {},
          conversation: { records: [], retentionEvents: [] },
          requestId: "req-1",
        });
      });

      expect(mockStartRunCommand).toHaveBeenCalledWith({
        runId,
        input: "hello",
      });
      expect(result.current.strategyName).toBe("test-strategy");

      act(() => {
        subscriptionHandlers.strategy_started?.({
          runId,
          strategyName: "test-strategy",
          agents: ["agent-a", "agent-b"],
        });
      });

      expect(result.current.runId).toBe(runId);
      expect(result.current.status).toBe("running");
      expect(result.current.messages).toHaveLength(2);
      expect(result.current.messages[1]?.role).toBe("system");
      expect(result.current.messages[1]?.text).toContain("test-strategy");
      expect(result.current.messages[1]?.text).toContain("agent-a");

      cleanup();
    });

    it("should wait for confirmation when an enabled MCP server fails", () => {
      const { result, runLifecycle, cleanup } = renderChatHook();

      act(() => {
        result.current.startStrategy("/path/to/strategy.json", "hello");
      });
      const runId = result.current.chatRunId!;

      act(() => {
        subscriptionHandlers.run_prepared?.({
          runId,
          strategyName: "test-strategy",
          agents: ["agent-a"],
          flowTree: {},
          conversation: { records: [], retentionEvents: [], inputs: [] },
          requestId: "req-1",
          mcpServers: [
            {
              id: "github",
              source: "workspace",
              transport: "http",
              enabled: true,
              enabledByDefault: true,
              connected: false,
              toolCount: 0,
              assignedAgents: ["agent-a"],
              error: "Connection refused",
            },
          ],
        });
      });

      expect(mockStartRunCommand).not.toHaveBeenCalled();
      expect(result.current.pendingMcpConfirmation).toBe(true);

      act(() => {
        runLifecycle.current.confirmMcpPreparation(runId, true);
      });

      expect(mockStartRunCommand).toHaveBeenCalledWith({
        runId,
        input: "hello",
      });
      expect(result.current.pendingMcpConfirmation).toBe(false);

      cleanup();
    });
  });

  describe("run preparation errors", () => {
    it("routes a correlated prepare error to the matching run", () => {
      const { result, cleanup } = renderChatHook();

      act(() => {
        result.current.startStrategy("/bad.json", "hello");
      });

      act(() => {
        subscriptionHandlers.error?.({
          type: "error",
          code: "PREPARE_FAILED",
          message: "Strategy file not found",
          requestId: "req-1",
        });
      });

      expect(result.current.status).toBe("error");
      expect(result.current.error).toBe("Strategy file not found");
      cleanup();
    });
  });

  describe("agent_streaming subscription", () => {
    /** Helper: start a strategy and bind it to a runId. */
    function bootstrapRun(result: { current: UseChatState }): string {
      let runId = "";
      act(() => {
        runId = result.current.startStrategy("/strategy.json");
      });
      act(() => {
        subscriptionHandlers.strategy_started?.({
          runId,
          strategyName: "s",
          agents: ["assistant"],
        });
      });
      return runId;
    }

    it("should append a new agent message on first text token", () => {
      const { result, cleanup } = renderChatHook();
      const runId = bootstrapRun(result);

      act(() => {
        subscriptionHandlers.agent_streaming?.({
          runId,
          agentName: "assistant",
          model: "openai/gpt-5",
          contextWindow: 128_000,
          event: { type: "text", text: "Hello" },
        });
      });

      const agentMessages = result.current.messages.filter(
        (m) => m.role === "agent",
      );
      expect(agentMessages).toHaveLength(1);
      expect(agentMessages[0]?.sender).toBe("assistant");
      expect(agentMessages[0]?.text).toBe("Hello");
      expect(agentMessages[0]?.streaming).toBe(true);
      expect(agentMessages[0]?.model).toBe("openai/gpt-5");
      expect(agentMessages[0]?.contextWindow).toBe(128_000);

      cleanup();
    });

    it("should render retention events as inline agent segments", () => {
      const { result, cleanup } = renderChatHook();
      const runId = bootstrapRun(result);

      act(() => {
        subscriptionHandlers.agent_streaming?.({
          runId,
          agentName: "assistant",
          event: {
            type: "retention",
            event: {
              id: "retention-1",
              agentName: "assistant",
              createdAt: "2026-01-01T00:00:00.000Z",
              kind: "compaction",
              reason: "context-window",
              trigger: {
                contextUsage: { totalTokens: 850 },
                tokenLimit: 1_000,
                ratio: 0.85,
                thresholdRatio: 0.85,
              },
              recordsCompacted: 3,
              recordsRetained: 2,
              summaryRecord: {
                id: "summary-1",
                agentName: "assistant",
                createdAt: "2026-01-01T00:00:00.000Z",
                userMessage: { role: "user", content: "summary request" },
                responseMessages: [{ role: "assistant", content: "summary" }],
                text: "summary",
                usage: { promptTokens: 0, completionTokens: 0 },
                finishReason: "stop",
                status: "active",
              },
              supersededRecordIds: ["1", "2", "3"],
            },
          },
        });
      });

      const agentMessage = result.current.messages.find(
        (message) => message.role === "agent",
      );
      expect(agentMessage?.segments?.[0]).toMatchObject({
        type: "retention",
        event: { id: "retention-1" },
      });

      cleanup();
    });

    it("should accumulate tokens into the same streaming message", () => {
      const { result, cleanup } = renderChatHook();
      const runId = bootstrapRun(result);

      act(() => {
        subscriptionHandlers.agent_streaming?.({
          runId,
          agentName: "assistant",
          event: { type: "text", text: "Hello" },
        });
      });

      act(() => {
        subscriptionHandlers.agent_streaming?.({
          runId,
          agentName: "assistant",
          event: { type: "text", text: " world" },
        });
      });

      const agentMessages = result.current.messages.filter(
        (m) => m.role === "agent",
      );
      expect(agentMessages).toHaveLength(1);
      expect(agentMessages[0]?.text).toBe("Hello world");
      expect(agentMessages[0]?.streaming).toBe(true);

      cleanup();
    });

    it("should mark message as not streaming on done event", () => {
      const { result, cleanup } = renderChatHook();
      const runId = bootstrapRun(result);

      act(() => {
        subscriptionHandlers.agent_streaming?.({
          runId,
          agentName: "assistant",
          event: { type: "text", text: "Done" },
        });
      });

      act(() => {
        subscriptionHandlers.agent_streaming?.({
          runId,
          agentName: "assistant",
          event: {
            type: "done",
            result: {
              text: "Done",
              usage: { promptTokens: 1_200, completionTokens: 50 },
              contextUsage: {
                totalTokens: 800,
                inputTokens: 750,
                outputTokens: 50,
              },
              finishReason: "stop",
            },
          },
        });
      });

      const agentMessages = result.current.messages.filter(
        (m) => m.role === "agent",
      );
      expect(agentMessages).toHaveLength(1);
      expect(agentMessages[0]?.streaming).toBe(false);
      expect(agentMessages[0]?.usage).toEqual({
        promptTokens: 1_200,
        completionTokens: 50,
      });
      expect(agentMessages[0]?.contextUsage).toEqual({
        totalTokens: 800,
        inputTokens: 750,
        outputTokens: 50,
      });
      expect(agentMessages[0]?.completedAt).toBeNumber();

      cleanup();
    });

    it("should attach spawned strategy output to its launch tool call", () => {
      const { result, cleanup } = renderChatHook();
      const runId = bootstrapRun(result);

      act(() => {
        subscriptionHandlers.agent_streaming?.({
          runId,
          agentName: "manager",
          event: {
            type: "tool-call",
            toolCallId: "launch-1",
            toolName: "launch_strategy",
            args: JSON.stringify({ name: "Plan", input: "Draft a plan" }),
          },
        });
      });
      act(() => {
        subscriptionHandlers.agent_output?.({
          runId,
          agentName: "planner",
          text: "Nested plan output",
        });
      });

      expect(result.current.messages.at(-1)).toMatchObject({
        sender: "planner",
        parentToolCallId: "launch-1",
      });

      act(() => {
        subscriptionHandlers.agent_streaming?.({
          runId,
          agentName: "manager",
          event: {
            type: "tool-result",
            toolCallId: "launch-1",
            toolName: "launch_strategy",
            output: "Plan complete",
            status: "completed",
          },
        });
      });
      act(() => {
        subscriptionHandlers.agent_output?.({
          runId,
          agentName: "manager",
          text: "Manager complete",
        });
      });

      expect(result.current.messages.at(-1)).toMatchObject({
        sender: "manager",
      });
      expect(result.current.messages.at(-1)?.parentToolCallId).toBeUndefined();

      cleanup();
    });
  });

  describe("agent_output subscription", () => {
    it("should add a non-streaming agent message", () => {
      const { result, cleanup } = renderChatHook();

      act(() => {
        result.current.startStrategy("/s.json");
      });
      const runId = result.current.chatRunId!;
      act(() => {
        subscriptionHandlers.strategy_started?.({
          runId,
          strategyName: "s",
          agents: ["assistant"],
        });
      });

      act(() => {
        subscriptionHandlers.agent_output?.({
          runId,
          agentName: "assistant",
          text: "Final output",
        });
      });

      const agentMessages = result.current.messages.filter(
        (m) => m.role === "agent",
      );
      expect(agentMessages).toHaveLength(1);
      expect(agentMessages[0]?.text).toBe("Final output");
      expect(agentMessages[0]?.streaming).toBe(false);

      cleanup();
    });
  });

  describe("request_input subscription", () => {
    it("should set pendingInputAgent and status to waiting_input", () => {
      const { result, cleanup } = renderChatHook();

      act(() => {
        result.current.startStrategy("/s.json");
      });
      const runId = result.current.chatRunId!;
      act(() => {
        subscriptionHandlers.strategy_started?.({
          runId,
          strategyName: "s",
          agents: ["user-agent"],
        });
      });

      act(() => {
        subscriptionHandlers.request_input?.({
          runId,
          agentName: "user-agent",
          prompt: "Please provide input:",
        });
      });

      expect(result.current.status).toBe("waiting_input");
      expect(result.current.pendingInputAgent).toBe("user-agent");
      const prompts = result.current.messages.filter((m) =>
        m.text.includes("Please provide input:"),
      );
      expect(prompts).toHaveLength(1);

      cleanup();
    });

    it("should not add system message when prompt is absent", () => {
      const { result, cleanup } = renderChatHook();

      act(() => {
        result.current.startStrategy("/s.json");
      });
      const runId = result.current.chatRunId!;
      act(() => {
        subscriptionHandlers.strategy_started?.({
          runId,
          strategyName: "s",
          agents: ["user-agent"],
        });
      });

      const beforeCount = result.current.messages.length;

      act(() => {
        subscriptionHandlers.request_input?.({
          runId,
          agentName: "user-agent",
        });
      });

      expect(result.current.pendingInputAgent).toBe("user-agent");
      expect(result.current.messages).toHaveLength(beforeCount);

      cleanup();
    });
  });

  describe("sendInput", () => {
    it("should add user message and send command when input is pending", () => {
      const { result, cleanup } = renderChatHook();

      act(() => {
        result.current.startStrategy("/s.json");
      });
      const runId = result.current.chatRunId!;
      act(() => {
        subscriptionHandlers.strategy_started?.({
          runId,
          strategyName: "test",
          agents: ["user-agent"],
        });
      });
      act(() => {
        subscriptionHandlers.request_input?.({
          runId,
          agentName: "user-agent",
          prompt: "Enter input:",
        });
      });

      act(() => {
        result.current.sendInput("my answer");
      });

      const userMessage = result.current.messages.find(
        (message) => message.role === "user",
      );
      expect(userMessage).toBeDefined();
      expect(userMessage?.text).toBe("my answer");
      expect(userMessage?.sender).toBe("you");

      expect(mockSendUserInputCommand).toHaveBeenCalledWith({
        runId,
        agentName: "user-agent",
        text: "my answer",
      });

      expect(result.current.pendingInputAgent).toBeNull();
      expect(result.current.status).toBe("running");

      cleanup();
    });

    it("should do nothing when there is no pending input agent", () => {
      const { result, cleanup } = renderChatHook();

      act(() => {
        result.current.sendInput("ignored");
      });

      expect(result.current.messages).toEqual([]);
      expect(mockSendUserInputCommand).not.toHaveBeenCalled();

      cleanup();
    });
  });

  describe("stop", () => {
    it("should call stop_run command for the bound run's runId", () => {
      const { result, cleanup } = renderChatHook();

      act(() => {
        result.current.startStrategy("/s.json");
      });
      const runId = result.current.chatRunId!;
      act(() => {
        subscriptionHandlers.strategy_started?.({
          runId,
          strategyName: "s",
          agents: ["a"],
        });
      });

      act(() => {
        result.current.stop();
      });

      expect(mockStopRunCommand).toHaveBeenCalledWith({
        runId,
      });

      cleanup();
    });

    it("should be a no-op when no run is bound", () => {
      const { result, cleanup } = renderChatHook();

      act(() => {
        result.current.stop();
      });

      expect(mockStopRunCommand).not.toHaveBeenCalled();

      cleanup();
    });
  });

  describe("strategy_completed subscription", () => {
    it("should set status to completed and add system message", () => {
      const { result, cleanup } = renderChatHook();

      act(() => {
        result.current.startStrategy("/s.json");
      });
      const runId = result.current.chatRunId!;
      act(() => {
        subscriptionHandlers.strategy_started?.({
          runId,
          strategyName: "s",
          agents: ["a"],
        });
      });

      act(() => {
        subscriptionHandlers.strategy_completed?.({ runId });
      });

      expect(result.current.status).toBe("completed");
      const completionMessages = result.current.messages.filter((m) =>
        m.text.includes("completed"),
      );
      expect(completionMessages.length).toBeGreaterThan(0);

      cleanup();
    });
  });

  describe("continueRun", () => {
    const pivotStrategy = {
      name: "plan",
      version: "1.0",
      path: "/plan.json",
      manifestPath: "/project/comma-project.json",
      origin: "cwd-project" as const,
      label: "Project > Plan",
    };

    function completeRun(result: { current: UseChatState }): string {
      let runId = "";
      act(() => {
        runId = result.current.startStrategy("/build.json", "build it");
      });
      act(() => {
        subscriptionHandlers.strategy_started?.({
          runId,
          strategyName: "build",
          agents: ["assistant"],
        });
        subscriptionHandlers.strategy_completed?.({ runId });
      });
      expect(result.current.status).toBe("completed");
      return runId;
    }

    it("prepares and continues the same run with a pivoted strategy", () => {
      const { result, runLifecycle, cleanup } = renderChatHook();
      const runId = completeRun(result);
      const existingMessages = result.current.messages.length;
      const existingTranscript = result.current.messages;

      act(() => {
        runLifecycle.current.continueRun(runId, pivotStrategy, "refine it");
      });

      expect(result.current.chatRunId).toBe(runId);
      expect(result.current.status).toBe("pending");
      expect(result.current.strategyPath).toBe("/plan.json");
      expect(result.current.messages).toHaveLength(existingMessages + 1);
      expect(result.current.messages.at(-1)?.text).toBe("refine it");
      expect(mockPrepareRunCommand).toHaveBeenLastCalledWith({
        runId,
        strategyPath: "/plan.json",
        manifestPath: "/project/comma-project.json",
      });

      act(() => {
        subscriptionHandlers.run_prepared?.({
          runId,
          strategyName: "plan",
          agents: ["assistant"],
          flowTree: {},
          conversation: { records: [], retentionEvents: [] },
          requestId: "req-1",
        });
      });

      expect(mockContinueRunCommand).toHaveBeenCalledWith({
        runId,
        input: "refine it",
      });
      expect(mockStartRunCommand).toHaveBeenCalledTimes(0);

      act(() => {
        subscriptionHandlers.strategy_started?.({
          runId,
          strategyName: "plan",
          agents: ["assistant"],
        });
      });

      expect(result.current.chatRunId).toBe(runId);
      expect(result.current.status).toBe("running");
      expect(result.current.strategyName).toBe("plan");
      expect(result.current.messages.slice(0, existingMessages)).toEqual([
        ...existingTranscript,
      ]);
      expectUniqueMessageIds(result.current.messages);

      act(() => {
        subscriptionHandlers.strategy_completed?.({ runId });
      });
      act(() => {
        runLifecycle.current.continueRun(runId, pivotStrategy, "refine again");
      });

      expect(result.current.chatRunId).toBe(runId);
      expect(mockPrepareRunCommand).toHaveBeenLastCalledWith({
        runId,
        strategyPath: "/plan.json",
        manifestPath: "/project/comma-project.json",
      });
      cleanup();
    });

    it("preserves the queued continuation prompt when preparation hydrates prior records", () => {
      const { result, runLifecycle, cleanup } = renderChatHook();
      let runId = "";

      act(() => {
        runId = result.current.startStrategy("/build.json", "build it");
      });
      act(() => {
        subscriptionHandlers.strategy_started?.({
          runId,
          strategyName: "build",
          agents: ["assistant"],
        });
      });
      act(() => {
        subscriptionHandlers.agent_output?.({
          runId,
          agentName: "assistant",
          text: "initial result",
        });
      });
      act(() => {
        subscriptionHandlers.strategy_completed?.({ runId });
      });

      act(() => {
        runLifecycle.current.continueRun(runId, pivotStrategy, "refine it");
      });
      act(() => {
        subscriptionHandlers.run_prepared?.({
          runId,
          strategyName: "plan",
          agents: ["assistant"],
          flowTree: {},
          conversation: {
            records: [
              {
                id: "record-1",
                agentName: "assistant",
                createdAt: "2026-01-01T00:00:30.000Z",
                userMessage: { role: "user", content: "build it" },
                responseMessages: [
                  { role: "assistant", content: "initial result" },
                ],
                text: "initial result",
                usage: { promptTokens: 100, completionTokens: 25 },
                finishReason: "stop",
              },
            ],
            retentionEvents: [],
          },
          requestId: "req-1",
        });
      });

      expect(mockContinueRunCommand).toHaveBeenCalledWith({
        runId,
        input: "refine it",
      });

      const continuationMessage = result.current.messages.find(
        (message) => message.text === "refine it",
      );
      expect(continuationMessage).toMatchObject({
        role: "user",
        sender: "you",
      });
      const initialResultMessages = result.current.messages.filter(
        (message) => message.text === "initial result",
      );
      expect(initialResultMessages.length).toBeGreaterThan(0);
      expect(
        initialResultMessages.every((message) => message.role === "agent"),
      ).toBe(true);
      expectUniqueMessageIds(result.current.messages);

      act(() => {
        subscriptionHandlers.strategy_started?.({
          runId,
          strategyName: "plan",
          agents: ["assistant"],
        });
      });
      act(() => {
        subscriptionHandlers.agent_output?.({
          runId,
          agentName: "assistant",
          text: "refined result",
        });
      });

      expect(result.current.messages.at(-1)).toMatchObject({
        role: "agent",
        sender: "assistant",
        text: "refined result",
      });
      expectUniqueMessageIds(result.current.messages);
      cleanup();
    });

    it("restores completed state when continuation preparation fails", () => {
      const { result, runLifecycle, cleanup } = renderChatHook();
      const runId = completeRun(result);

      act(() => {
        runLifecycle.current.continueRun(runId, pivotStrategy, "try again");
      });
      act(() => {
        subscriptionHandlers.error?.({
          type: "error",
          code: "PREPARE_FAILED",
          message: "Could not prepare continuation",
          requestId: "req-1",
        });
      });

      expect(result.current.status).toBe("completed");
      expect(
        result.current.messages.some((message) => message.text === "try again"),
      ).toBe(true);
      expect(result.current.messages.at(-1)?.text).toBe(
        "Error: Could not prepare continuation",
      );
      cleanup();
    });

    it("restores completed state when continue_run fails", () => {
      const { result, runLifecycle, cleanup } = renderChatHook();
      const runId = completeRun(result);

      act(() => {
        runLifecycle.current.continueRun(runId, pivotStrategy, "retry");
      });
      act(() => {
        subscriptionHandlers.run_prepared?.({
          runId,
          strategyName: "plan",
          agents: ["assistant"],
          flowTree: {},
          conversation: { records: [], retentionEvents: [] },
          requestId: "req-1",
        });
      });
      act(() => {
        subscriptionHandlers.error?.({
          type: "error",
          code: "CONTINUE_FAILED",
          message: "Cannot continue run",
          requestId: "req-continue",
        });
      });

      expect(result.current.status).toBe("completed");
      expect(result.current.messages.at(-1)?.text).toContain(
        "Cannot continue run",
      );
      cleanup();
    });
  });

  describe("strategy_error subscription", () => {
    it("should set error status and display error message", () => {
      const { result, cleanup } = renderChatHook();

      act(() => {
        result.current.startStrategy("/s.json");
      });
      const runId = result.current.chatRunId!;
      act(() => {
        subscriptionHandlers.strategy_started?.({
          runId,
          strategyName: "s",
          agents: ["a"],
        });
      });

      act(() => {
        subscriptionHandlers.strategy_error?.({
          runId,
          error: { message: "Something went wrong" },
        });
      });

      expect(result.current.status).toBe("error");
      expect(result.current.error).toBe("Something went wrong");
      const errorMessages = result.current.messages.filter((m) =>
        m.text.includes("Something went wrong"),
      );
      expect(errorMessages.length).toBeGreaterThan(0);

      cleanup();
    });
  });

  describe("error subscription (unrouted)", () => {
    it("should not guess a run for a generic daemon error", () => {
      const { result, cleanup } = renderChatHook();

      act(() => {
        result.current.startStrategy("/s.json");
      });

      act(() => {
        subscriptionHandlers.error?.({
          message: "Connection lost",
        });
      });

      expect(result.current.status).toBe("pending");
      expect(result.current.error).toBeNull();

      cleanup();
    });

    it("should be a no-op when no run is bound", () => {
      const { result, cleanup } = renderChatHook();

      act(() => {
        subscriptionHandlers.error?.({ message: "ignored" });
      });

      expect(result.current.error).toBeNull();

      cleanup();
    });
  });

  describe("step_started and step_completed subscriptions", () => {
    it("should add system messages for step lifecycle routed by runId", () => {
      const { result, cleanup } = renderChatHook();

      act(() => {
        result.current.startStrategy("/s.json");
      });
      const runId = result.current.chatRunId!;
      act(() => {
        subscriptionHandlers.strategy_started?.({
          runId,
          strategyName: "s",
          agents: ["a"],
        });
      });

      act(() => {
        subscriptionHandlers.step_started?.({
          runId,
          stepName: "planning",
        });
      });
      act(() => {
        subscriptionHandlers.step_completed?.({
          runId,
          stepName: "planning",
        });
      });

      const stepStarted = result.current.messages.filter((m) =>
        m.text.includes("[planning] started"),
      );
      const stepCompleted = result.current.messages.filter((m) =>
        m.text.includes("[planning] completed"),
      );
      expect(stepStarted).toHaveLength(1);
      expect(stepCompleted).toHaveLength(1);

      cleanup();
    });
  });

  describe("reset", () => {
    it("should clear UI projection back to idle (keeps daemonRunId)", () => {
      const { result, cleanup } = renderChatHook();

      act(() => {
        result.current.startStrategy("/s.json");
      });
      const runId = result.current.chatRunId!;
      act(() => {
        subscriptionHandlers.strategy_started?.({
          runId,
          strategyName: "s",
          agents: ["a"],
        });
      });
      act(() => {
        subscriptionHandlers.strategy_error?.({
          runId,
          error: { message: "fail" },
        });
      });

      act(() => {
        result.current.reset();
      });

      expect(result.current.messages).toEqual([]);
      expect(result.current.status).toBe("idle");
      expect(result.current.error).toBeNull();
      expect(result.current.pendingInputAgent).toBeNull();
      // daemonRunId intentionally preserved — subscription stays alive.
      expect(result.current.runId).toBe(runId);

      cleanup();
    });
  });

  describe("multi-run routing", () => {
    it("should route run events to the correct run by runId", () => {
      const { chatRuns, runLifecycle, cleanup } = renderChatHook();

      let sessionA = "";
      act(() => {
        sessionA = runLifecycle.current.startStrategy("/a.json");
      });
      act(() => {
        subscriptionHandlers.strategy_started?.({
          runId: sessionA,
          strategyName: "A",
          agents: ["agent-a"],
        });
      });

      let sessionB = "";
      act(() => {
        sessionB = runLifecycle.current.startStrategy("/b.json");
      });
      act(() => {
        subscriptionHandlers.strategy_started?.({
          runId: sessionB,
          strategyName: "B",
          agents: ["agent-b"],
        });
      });

      // Send an agent_output for run-A only.
      act(() => {
        subscriptionHandlers.agent_output?.({
          runId: sessionA,
          agentName: "agent-a",
          text: "from A",
        });
      });

      const a = chatRuns.current.chatRuns.get(sessionA)!;
      const b = chatRuns.current.chatRuns.get(sessionB)!;

      expect(a.messages.some((m) => m.text === "from A")).toBe(true);
      expect(b.messages.some((m) => m.text === "from A")).toBe(false);

      cleanup();
    });
  });
});
