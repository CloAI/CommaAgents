// Tests for all daemon → client message schemas.

import { describe, expect, test } from "bun:test";
import { DaemonMessage, parseDaemonMessage } from "./messages";
import { AgentOutputMessage } from "./responses/agent-output";
import { AgentStreamingMessage } from "./responses/agent-streaming";
import { ErrorMessage } from "./responses/error";
import { StrategyCompletedMessage } from "./responses/strategy-completed";
import { StrategyErrorMessage } from "./responses/strategy-error";
import { StrategyListMessage } from "./responses/strategy-list";
import { StrategyStartedMessage } from "./responses/strategy-started";
import { PongMessage } from "./responses/pong";
import { RequestInputMessage } from "./responses/request-input";
import { StepCompletedMessage } from "./responses/step-completed";
import { StepStartedMessage } from "./responses/step-started";

const ts = "2026-03-01T12:00:00.000Z";
const usage = { promptTokens: 10, completionTokens: 5 };
const agentResult = { text: "done", usage, finishReason: "stop" };

// Individual message schemas

describe("StrategyStartedMessage", () => {
  test("parses valid message", () => {
    const msg = {
      type: "strategy_started",
      ts,
      runId: "run-1",
      strategyName: "test",
      agents: ["agent-a", "agent-b"],
      flowTree: { root: { type: "sequential" } },
    };
    expect(StrategyStartedMessage.parse(msg)).toEqual(msg);
  });

  test("accepts empty agents array", () => {
    const msg = {
      type: "strategy_started",
      ts,
      runId: "run-1",
      strategyName: "test",
      agents: [],
      flowTree: {},
    };
    expect(StrategyStartedMessage.parse(msg).agents).toEqual([]);
  });

  test("rejects missing runId", () => {
    expect(
      StrategyStartedMessage.safeParse({
        type: "strategy_started",
        ts,
        strategyName: "t",
        agents: [],
        flowTree: {},
      }).success,
    ).toBe(false);
  });

  test("rejects missing ts", () => {
    expect(
      StrategyStartedMessage.safeParse({
        type: "strategy_started",
        runId: "r",
        strategyName: "t",
        agents: [],
        flowTree: {},
      }).success,
    ).toBe(false);
  });
});

describe("StrategyCompletedMessage", () => {
  test("parses valid message", () => {
    const msg = { type: "strategy_completed", ts, runId: "run-1", result: "final output", usage };
    expect(StrategyCompletedMessage.parse(msg)).toEqual(msg);
  });

  test("rejects missing result", () => {
    expect(
      StrategyCompletedMessage.safeParse({ type: "strategy_completed", ts, runId: "r", usage })
        .success,
    ).toBe(false);
  });

  test("rejects missing usage", () => {
    expect(
      StrategyCompletedMessage.safeParse({
        type: "strategy_completed",
        ts,
        runId: "r",
        result: "ok",
      }).success,
    ).toBe(false);
  });
});

describe("StrategyErrorMessage", () => {
  test("parses valid message", () => {
    const msg = {
      type: "strategy_error",
      ts,
      runId: "run-1",
      error: { code: "EXEC_FAILED", message: "Agent crashed" },
    };
    expect(StrategyErrorMessage.parse(msg)).toEqual(msg);
  });

  test("rejects error missing code", () => {
    expect(
      StrategyErrorMessage.safeParse({
        type: "strategy_error",
        ts,
        runId: "r",
        error: { message: "oops" },
      }).success,
    ).toBe(false);
  });
});

describe("AgentOutputMessage", () => {
  test("parses valid message", () => {
    const msg = {
      type: "agent_output",
      ts,
      runId: "run-1",
      agentName: "summarizer",
      text: "summary",
      usage,
    };
    expect(AgentOutputMessage.parse(msg)).toEqual(msg);
  });

  test("rejects missing agentName", () => {
    expect(
      AgentOutputMessage.safeParse({ type: "agent_output", ts, runId: "r", text: "t", usage })
        .success,
    ).toBe(false);
  });
});

describe("AgentStreamingMessage", () => {
  test("parses text stream event", () => {
    const msg = {
      type: "agent_streaming",
      ts,
      runId: "run-1",
      agentName: "writer",
      event: { type: "text", text: "hello" },
    };
    expect(AgentStreamingMessage.parse(msg)).toEqual(msg);
  });

  test("parses tool-call stream event", () => {
    const msg = {
      type: "agent_streaming",
      ts,
      runId: "run-1",
      agentName: "coder",
      event: { type: "tool-call", toolName: "exec", args: '{"cmd":"ls"}' },
    };
    expect(AgentStreamingMessage.parse(msg)).toEqual(msg);
  });

  test("parses tool-result stream event", () => {
    const msg = {
      type: "agent_streaming",
      ts,
      runId: "run-1",
      agentName: "coder",
      event: { type: "tool-result", toolName: "exec", output: "files" },
    };
    expect(AgentStreamingMessage.parse(msg)).toEqual(msg);
  });

  test("parses step-start stream event", () => {
    const msg = {
      type: "agent_streaming",
      ts,
      runId: "run-1",
      agentName: "coder",
      event: { type: "step-start" },
    };
    expect(AgentStreamingMessage.parse(msg)).toEqual(msg);
  });

  test("parses done stream event", () => {
    const msg = {
      type: "agent_streaming",
      ts,
      runId: "run-1",
      agentName: "coder",
      event: { type: "done", result: agentResult },
    };
    expect(AgentStreamingMessage.parse(msg)).toEqual(msg);
  });

  test("rejects unknown stream event type", () => {
    expect(
      AgentStreamingMessage.safeParse({
        type: "agent_streaming",
        ts,
        runId: "r",
        agentName: "a",
        event: { type: "unknown" },
      }).success,
    ).toBe(false);
  });

  test("rejects missing event", () => {
    expect(
      AgentStreamingMessage.safeParse({
        type: "agent_streaming",
        ts,
        runId: "r",
        agentName: "a",
      }).success,
    ).toBe(false);
  });
});

describe("StepStartedMessage", () => {
  test("parses valid message", () => {
    const msg = { type: "step_started", ts, runId: "run-1", stepName: "agent-a", message: "hello" };
    expect(StepStartedMessage.parse(msg)).toEqual(msg);
  });

  test("rejects missing stepName", () => {
    expect(
      StepStartedMessage.safeParse({ type: "step_started", ts, runId: "r", message: "m" }).success,
    ).toBe(false);
  });
});

describe("StepCompletedMessage", () => {
  test("parses valid message", () => {
    const msg = {
      type: "step_completed",
      ts,
      runId: "run-1",
      stepName: "agent-a",
      result: agentResult,
    };
    expect(StepCompletedMessage.parse(msg)).toEqual(msg);
  });

  test("rejects missing result", () => {
    expect(
      StepCompletedMessage.safeParse({ type: "step_completed", ts, runId: "r", stepName: "s" })
        .success,
    ).toBe(false);
  });

  test("rejects result missing usage", () => {
    expect(
      StepCompletedMessage.safeParse({
        type: "step_completed",
        ts,
        runId: "r",
        stepName: "s",
        result: { text: "ok", finishReason: "stop" },
      }).success,
    ).toBe(false);
  });
});

describe("RequestInputMessage", () => {
  test("parses valid message without prompt", () => {
    const msg = { type: "request_input", ts, runId: "run-1", agentName: "user-agent" };
    expect(RequestInputMessage.parse(msg)).toEqual(msg);
  });

  test("parses valid message with prompt", () => {
    const msg = {
      type: "request_input",
      ts,
      runId: "run-1",
      agentName: "user-agent",
      prompt: "Enter name:",
    };
    expect(RequestInputMessage.parse(msg).prompt).toBe("Enter name:");
  });

  test("rejects missing agentName", () => {
    expect(RequestInputMessage.safeParse({ type: "request_input", ts, runId: "r" }).success).toBe(
      false,
    );
  });
});

describe("StrategyListMessage", () => {
  test("parses valid message with runs", () => {
    const msg = {
      type: "strategy_list",
      ts,
      runs: [
        {
          runId: "run-1",
          strategyName: "test",
          status: "running",
          startedAt: "2026-03-01T12:00:00.000Z",
        },
      ],
    };
    expect(StrategyListMessage.parse(msg).runs).toHaveLength(1);
  });

  test("parses valid message with empty runs", () => {
    const msg = { type: "strategy_list", ts, runs: [] };
    expect(StrategyListMessage.parse(msg).runs).toEqual([]);
  });

  test("rejects missing runs array", () => {
    expect(StrategyListMessage.safeParse({ type: "strategy_list", ts }).success).toBe(false);
  });

  test("rejects run with invalid status", () => {
    expect(
      StrategyListMessage.safeParse({
        type: "strategy_list",
        ts,
        runs: [{ runId: "r", strategyName: "s", status: "paused", startedAt: ts }],
      }).success,
    ).toBe(false);
  });
});

describe("PongMessage", () => {
  test("parses valid message", () => {
    expect(PongMessage.parse({ type: "pong", ts })).toEqual({ type: "pong", ts });
  });

  test("accepts requestId", () => {
    expect(PongMessage.parse({ type: "pong", ts, requestId: "req-1" }).requestId).toBe("req-1");
  });

  test("rejects missing ts", () => {
    expect(PongMessage.safeParse({ type: "pong" }).success).toBe(false);
  });
});

describe("ErrorMessage", () => {
  test("parses valid message", () => {
    const msg = { type: "error", ts, code: "INVALID_MESSAGE", message: "Bad JSON" };
    expect(ErrorMessage.parse(msg)).toEqual(msg);
  });

  test("accepts requestId for correlation", () => {
    const msg = { type: "error", ts, code: "NOT_FOUND", message: "No run", requestId: "req-5" };
    expect(ErrorMessage.parse(msg).requestId).toBe("req-5");
  });

  test("rejects missing code", () => {
    expect(ErrorMessage.safeParse({ type: "error", ts, message: "oops" }).success).toBe(false);
  });

  test("rejects missing message", () => {
    expect(ErrorMessage.safeParse({ type: "error", ts, code: "ERR" }).success).toBe(false);
  });
});

// DaemonMessage discriminated union

describe("DaemonMessage union", () => {
  test("routes strategy_started correctly", () => {
    const result = DaemonMessage.parse({
      type: "strategy_started",
      ts,
      runId: "r",
      strategyName: "s",
      agents: [],
      flowTree: {},
    });
    expect(result.type).toBe("strategy_started");
  });

  test("routes strategy_completed correctly", () => {
    const result = DaemonMessage.parse({
      type: "strategy_completed",
      ts,
      runId: "r",
      result: "ok",
      usage,
    });
    expect(result.type).toBe("strategy_completed");
  });

  test("routes strategy_error correctly", () => {
    const result = DaemonMessage.parse({
      type: "strategy_error",
      ts,
      runId: "r",
      error: { code: "ERR", message: "fail" },
    });
    expect(result.type).toBe("strategy_error");
  });

  test("routes agent_output correctly", () => {
    const result = DaemonMessage.parse({
      type: "agent_output",
      ts,
      runId: "r",
      agentName: "a",
      text: "t",
      usage,
    });
    expect(result.type).toBe("agent_output");
  });

  test("routes agent_streaming correctly", () => {
    const result = DaemonMessage.parse({
      type: "agent_streaming",
      ts,
      runId: "r",
      agentName: "a",
      event: { type: "text", text: "hi" },
    });
    expect(result.type).toBe("agent_streaming");
  });

  test("routes step_started correctly", () => {
    const result = DaemonMessage.parse({
      type: "step_started",
      ts,
      runId: "r",
      stepName: "s",
      message: "m",
    });
    expect(result.type).toBe("step_started");
  });

  test("routes step_completed correctly", () => {
    const result = DaemonMessage.parse({
      type: "step_completed",
      ts,
      runId: "r",
      stepName: "s",
      result: agentResult,
    });
    expect(result.type).toBe("step_completed");
  });

  test("routes request_input correctly", () => {
    const result = DaemonMessage.parse({
      type: "request_input",
      ts,
      runId: "r",
      agentName: "a",
    });
    expect(result.type).toBe("request_input");
  });

  test("routes strategy_list correctly", () => {
    const result = DaemonMessage.parse({
      type: "strategy_list",
      ts,
      runs: [],
    });
    expect(result.type).toBe("strategy_list");
  });

  test("routes pong correctly", () => {
    const result = DaemonMessage.parse({ type: "pong", ts });
    expect(result.type).toBe("pong");
  });

  test("routes error correctly", () => {
    const result = DaemonMessage.parse({
      type: "error",
      ts,
      code: "ERR",
      message: "fail",
    });
    expect(result.type).toBe("error");
  });

  test("rejects unknown type", () => {
    expect(DaemonMessage.safeParse({ type: "unknown_msg", ts }).success).toBe(false);
  });

  test("rejects missing type", () => {
    expect(DaemonMessage.safeParse({ ts }).success).toBe(false);
  });

  test("rejects empty object", () => {
    expect(DaemonMessage.safeParse({}).success).toBe(false);
  });
});

// parseDaemonMessage helper

describe("parseDaemonMessage", () => {
  test("returns success for valid message", () => {
    const result = parseDaemonMessage({ type: "pong", ts });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.type).toBe("pong");
    }
  });

  test("returns failure for invalid message", () => {
    const result = parseDaemonMessage({ type: "bad", ts });
    expect(result.success).toBe(false);
  });

  test("handles non-object input", () => {
    expect(parseDaemonMessage("not json").success).toBe(false);
    expect(parseDaemonMessage(null).success).toBe(false);
    expect(parseDaemonMessage(42).success).toBe(false);
  });
});
