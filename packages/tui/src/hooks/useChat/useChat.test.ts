// Enable React act() environment for bun:test
(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

// Suppress React act() warnings from ink-testing-library's internal renders
const originalConsoleError = console.error;
console.error = (...args: unknown[]) => {
  if (typeof args[0] === "string" && args[0].includes("was not wrapped in act"))
    return;
  originalConsoleError(...args);
};

import { beforeEach, describe, expect, it, mock } from "bun:test";
import { Text } from "ink";
import { render } from "ink-testing-library";
import React, { act } from "react";

import type { ChatRunsContextType, UseChatState } from "./useChat.types";

/** Captured subscription callbacks keyed by event type. */
let subscriptionHandlers: Record<string, (message: unknown) => void> = {};

/** Mock for useDaemonCommand — returns a mock sender per command type. */
const mockStartStrategyCommand = mock<
  (payload: Record<string, unknown>) => string | null
>(() => "req-1");
const mockContinueRunCommand = mock<
  (payload: Record<string, unknown>) => string | null
>(() => "req-continue");
const mockSendUserInputCommand = mock<
  (payload: Record<string, unknown>) => string | null
>(() => "req-2");
const mockStopStrategyCommand = mock<
  (payload: Record<string, unknown>) => string | null
>(() => "req-3");

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
    if (type === "start_strategy") return mockStartStrategyCommand;
    if (type === "continue_run") return mockContinueRunCommand;
    if (type === "user_input") return mockSendUserInputCommand;
    if (type === "stop_strategy") return mockStopStrategyCommand;
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
const { ChatRunsContextProvider } = await import("./useChat.context");

/**
 * Render a component that observes `useChat` (bound to the active run).
 * Returns a mutable ref exposing the latest hook state plus a cleanup fn.
 */
function renderChatHook(): {
  result: { current: UseChatState };
  chatRuns: { current: ChatRunsContextType };
  cleanup: () => void;
} {
  const resultRef: { current: UseChatState } = {} as { current: UseChatState };
  const sessionsRef: { current: ChatRunsContextType } = {} as {
    current: ChatRunsContextType;
  };

  function TestComponent(): React.ReactElement {
    resultRef.current = useChat();
    sessionsRef.current = useChatRuns();
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
    cleanup: () => instance.unmount(),
  };
}

beforeEach(() => {
  subscriptionHandlers = {};
  mockStartStrategyCommand.mockClear();
  mockContinueRunCommand.mockClear();
  mockSendUserInputCommand.mockClear();
  mockStopStrategyCommand.mockClear();
  mockStartStrategyCommand.mockReturnValue("req-1");
  mockContinueRunCommand.mockReturnValue("req-continue");
});

describe("useChat", () => {
  it("should start with no active run and empty state", () => {
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
    it("should create a run, make it active, and call the daemon command", () => {
      const { result, cleanup } = renderChatHook();

      act(() => {
        result.current.startStrategy("/path/to/strategy.json", "hello");
      });

      expect(result.current.chatRunId).not.toBeNull();
      expect(result.current.status).toBe("running");
      expect(result.current.error).toBeNull();
      expect(mockStartStrategyCommand).toHaveBeenCalledWith({
        strategyPath: "/path/to/strategy.json",
        input: "hello",
      });

      cleanup();
    });

    it("should send command without input when input is omitted", () => {
      const { result, cleanup } = renderChatHook();

      act(() => {
        result.current.startStrategy("/path/to/strategy.json");
      });

      expect(mockStartStrategyCommand).toHaveBeenCalledWith({
        strategyPath: "/path/to/strategy.json",
      });

      cleanup();
    });

    it("should set error status when daemon command returns null", () => {
      mockStartStrategyCommand.mockReturnValue(null);
      const { result, cleanup } = renderChatHook();

      act(() => {
        result.current.startStrategy("/path/to/strategy.json");
      });

      expect(result.current.status).toBe("error");
      expect(result.current.error).toContain("Cannot reach daemon");

      cleanup();
    });
  });

  describe("strategy_started subscription", () => {
    it("should bind daemonRunId to the pending run and add a system message", () => {
      const { result, cleanup } = renderChatHook();

      act(() => {
        result.current.startStrategy("/path/to/strategy.json");
      });

      act(() => {
        subscriptionHandlers.strategy_started?.({
          runId: "run-123",
          strategyName: "test-strategy",
          agents: ["agent-a", "agent-b"],
        });
      });

      expect(result.current.runId).toBe("run-123");
      expect(result.current.status).toBe("running");
      expect(result.current.messages).toHaveLength(1);
      expect(result.current.messages[0]?.role).toBe("system");
      expect(result.current.messages[0]?.text).toContain("test-strategy");
      expect(result.current.messages[0]?.text).toContain("agent-a");

      cleanup();
    });
  });

  describe("sendContinue", () => {
    it("starts a new local run through continue_run", () => {
      const { result, cleanup } = renderChatHook();

      act(() => {
        result.current.startStrategy("/path/to/strategy.json", "first");
      });
      act(() => {
        subscriptionHandlers.strategy_started?.({
          runId: "run-123",
          strategyName: "test-strategy",
          agents: ["assistant"],
        });
      });
      act(() => {
        subscriptionHandlers.strategy_completed?.({
          runId: "run-123",
          result: "done",
          usage: { promptTokens: 1, completionTokens: 1 },
        });
      });

      const originalChatRunId = result.current.chatRunId;
      act(() => {
        result.current.sendContinue(
          {
            name: "build",
            version: "1.0",
            path: "/path/to/build.json",
            manifestPath: "/path/to/comma-project.json",
            origin: "cwd-project",
            label: "Project > build",
          },
          "keep going",
        );
      });

      expect(result.current.chatRunId).not.toBe(originalChatRunId);
      expect(result.current.status).toBe("running");
      expect(mockContinueRunCommand).toHaveBeenCalledWith({
        runId: "run-123",
        input: "keep going",
        strategyPath: "/path/to/build.json",
        manifestPath: "/path/to/comma-project.json",
      });
      expect(result.current.strategyPath).toBe("/path/to/build.json");
      expect(result.current.strategyName).toBe("build");

      cleanup();
    });
  });

  describe("agent_streaming subscription", () => {
    /** Helper: start a strategy and bind it to a runId. */
    function bootstrapRun(
      result: { current: UseChatState },
      runId = "run-1",
    ): void {
      act(() => {
        result.current.startStrategy("/strategy.json");
      });
      act(() => {
        subscriptionHandlers.strategy_started?.({
          runId,
          strategyName: "s",
          agents: ["assistant"],
        });
      });
    }

    it("should append a new agent message on first text token", () => {
      const { result, cleanup } = renderChatHook();
      bootstrapRun(result);

      act(() => {
        subscriptionHandlers.agent_streaming?.({
          runId: "run-1",
          agentName: "assistant",
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

      cleanup();
    });

    it("should accumulate tokens into the same streaming message", () => {
      const { result, cleanup } = renderChatHook();
      bootstrapRun(result);

      act(() => {
        subscriptionHandlers.agent_streaming?.({
          runId: "run-1",
          agentName: "assistant",
          event: { type: "text", text: "Hello" },
        });
      });

      act(() => {
        subscriptionHandlers.agent_streaming?.({
          runId: "run-1",
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
      bootstrapRun(result);

      act(() => {
        subscriptionHandlers.agent_streaming?.({
          runId: "run-1",
          agentName: "assistant",
          event: { type: "text", text: "Done" },
        });
      });

      act(() => {
        subscriptionHandlers.agent_streaming?.({
          runId: "run-1",
          agentName: "assistant",
          event: { type: "done" },
        });
      });

      const agentMessages = result.current.messages.filter(
        (m) => m.role === "agent",
      );
      expect(agentMessages).toHaveLength(1);
      expect(agentMessages[0]?.streaming).toBe(false);

      cleanup();
    });
  });

  describe("agent_output subscription", () => {
    it("should add a non-streaming agent message", () => {
      const { result, cleanup } = renderChatHook();

      act(() => {
        result.current.startStrategy("/s.json");
      });
      act(() => {
        subscriptionHandlers.strategy_started?.({
          runId: "run-1",
          strategyName: "s",
          agents: ["assistant"],
        });
      });

      act(() => {
        subscriptionHandlers.agent_output?.({
          runId: "run-1",
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
      act(() => {
        subscriptionHandlers.strategy_started?.({
          runId: "run-1",
          strategyName: "s",
          agents: ["user-agent"],
        });
      });

      act(() => {
        subscriptionHandlers.request_input?.({
          runId: "run-1",
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
      act(() => {
        subscriptionHandlers.strategy_started?.({
          runId: "run-1",
          strategyName: "s",
          agents: ["user-agent"],
        });
      });

      const beforeCount = result.current.messages.length;

      act(() => {
        subscriptionHandlers.request_input?.({
          runId: "run-1",
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
      act(() => {
        subscriptionHandlers.strategy_started?.({
          runId: "run-123",
          strategyName: "test",
          agents: ["user-agent"],
        });
      });
      act(() => {
        subscriptionHandlers.request_input?.({
          runId: "run-123",
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
        runId: "run-123",
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
    it("should call stop_strategy command for the bound run's runId", () => {
      const { result, cleanup } = renderChatHook();

      act(() => {
        result.current.startStrategy("/s.json");
      });
      act(() => {
        subscriptionHandlers.strategy_started?.({
          runId: "run-123",
          strategyName: "s",
          agents: ["a"],
        });
      });

      act(() => {
        result.current.stop();
      });

      expect(mockStopStrategyCommand).toHaveBeenCalledWith({
        runId: "run-123",
      });

      cleanup();
    });

    it("should be a no-op when no run is active", () => {
      const { result, cleanup } = renderChatHook();

      act(() => {
        result.current.stop();
      });

      expect(mockStopStrategyCommand).not.toHaveBeenCalled();

      cleanup();
    });
  });

  describe("strategy_completed subscription", () => {
    it("should set status to completed and add system message", () => {
      const { result, cleanup } = renderChatHook();

      act(() => {
        result.current.startStrategy("/s.json");
      });
      act(() => {
        subscriptionHandlers.strategy_started?.({
          runId: "run-1",
          strategyName: "s",
          agents: ["a"],
        });
      });

      act(() => {
        subscriptionHandlers.strategy_completed?.({ runId: "run-1" });
      });

      expect(result.current.status).toBe("completed");
      const completionMessages = result.current.messages.filter((m) =>
        m.text.includes("completed"),
      );
      expect(completionMessages.length).toBeGreaterThan(0);

      cleanup();
    });
  });

  describe("strategy_error subscription", () => {
    it("should set error status and display error message", () => {
      const { result, cleanup } = renderChatHook();

      act(() => {
        result.current.startStrategy("/s.json");
      });
      act(() => {
        subscriptionHandlers.strategy_started?.({
          runId: "run-1",
          strategyName: "s",
          agents: ["a"],
        });
      });

      act(() => {
        subscriptionHandlers.strategy_error?.({
          runId: "run-1",
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
    it("should route generic daemon error to the active run", () => {
      const { result, cleanup } = renderChatHook();

      act(() => {
        result.current.startStrategy("/s.json");
      });

      act(() => {
        subscriptionHandlers.error?.({
          message: "Connection lost",
        });
      });

      expect(result.current.status).toBe("error");
      expect(result.current.error).toBe("Connection lost");

      cleanup();
    });

    it("should be a no-op when no run is active", () => {
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
      act(() => {
        subscriptionHandlers.strategy_started?.({
          runId: "run-1",
          strategyName: "s",
          agents: ["a"],
        });
      });

      act(() => {
        subscriptionHandlers.step_started?.({
          runId: "run-1",
          stepName: "planning",
        });
      });
      act(() => {
        subscriptionHandlers.step_completed?.({
          runId: "run-1",
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
      act(() => {
        subscriptionHandlers.strategy_started?.({
          runId: "run-1",
          strategyName: "s",
          agents: ["a"],
        });
      });
      act(() => {
        subscriptionHandlers.strategy_error?.({
          runId: "run-1",
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
      expect(result.current.runId).toBe("run-1");

      cleanup();
    });
  });

  describe("multi-run routing", () => {
    it("should route run events to the correct run by runId", () => {
      const { chatRuns, cleanup } = renderChatHook();

      // Create two runs via the raw context API.
      let sessionA: string = "";
      let sessionB: string = "";
      act(() => {
        sessionA = chatRuns.current.startStrategy("/a.json");
      });
      act(() => {
        subscriptionHandlers.strategy_started?.({
          runId: "run-A",
          strategyName: "A",
          agents: ["agent-a"],
        });
      });

      act(() => {
        sessionB = chatRuns.current.startStrategy("/b.json");
      });
      act(() => {
        subscriptionHandlers.strategy_started?.({
          runId: "run-B",
          strategyName: "B",
          agents: ["agent-b"],
        });
      });

      // Send an agent_output for run-A only.
      act(() => {
        subscriptionHandlers.agent_output?.({
          runId: "run-A",
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
