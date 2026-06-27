// Tests for all daemon → client message schemas.

import { describe, expect, test } from "bun:test";
import { DaemonMessage, parseDaemonMessage } from "./messages";
import { AgentOutputMessage } from "./responses/agent-output";
import { AgentStreamingMessage } from "./responses/agent-streaming";
import { ErrorMessage } from "./responses/error";
import { PongMessage } from "./responses/pong";
import { RequestInputMessage } from "./responses/request-input";
import { StepCompletedMessage } from "./responses/step-completed";
import { StepStartedMessage } from "./responses/step-started";
import { StrategyCompletedMessage } from "./responses/strategy-completed";
import { StrategyErrorMessage } from "./responses/strategy-error";
import { StrategyListMessage } from "./responses/strategy-list";
import { StrategyStartedMessage } from "./responses/strategy-started";

const ts = "2026-03-01T12:00:00.000Z";
const usage = { promptTokens: 10, completionTokens: 5 };
const agentResult = { text: "done", usage, finishReason: "stop" };

// Individual message schemas

describe("StrategyStartedMessage", () => {
  test("parses valid message", () => {
    const msg = {
      type: "strategy_started" as const,
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
      type: "strategy_started" as const,
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
        type: "strategy_started" as const,
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
        type: "strategy_started" as const,
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
    const msg = {
      type: "strategy_completed" as const,
      ts,
      runId: "run-1",
      result: "final output",
      usage,
    };
    expect(StrategyCompletedMessage.parse(msg)).toEqual(msg);
  });

  test("rejects missing result", () => {
    expect(
      StrategyCompletedMessage.safeParse({
        type: "strategy_completed" as const,
        ts,
        runId: "r",
        usage,
      }).success,
    ).toBe(false);
  });

  test("rejects missing usage", () => {
    expect(
      StrategyCompletedMessage.safeParse({
        type: "strategy_completed" as const,
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
      type: "strategy_error" as const,
      ts,
      runId: "run-1",
      error: { code: "EXEC_FAILED", message: "Agent crashed" },
    };
    expect(StrategyErrorMessage.parse(msg)).toEqual(msg);
  });

  test("rejects error missing code", () => {
    expect(
      StrategyErrorMessage.safeParse({
        type: "strategy_error" as const,
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
      type: "agent_output" as const,
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
      AgentOutputMessage.safeParse({
        type: "agent_output" as const,
        ts,
        runId: "r",
        text: "t",
        usage,
      }).success,
    ).toBe(false);
  });
});

describe("AgentStreamingMessage", () => {
  test("parses text stream event", () => {
    const msg = {
      type: "agent_streaming" as const,
      ts,
      runId: "run-1",
      agentName: "writer",
      model: "openai/gpt-4o",
      contextWindow: 128_000,
      event: { type: "text" as const, text: "hello" },
    };
    expect(AgentStreamingMessage.parse(msg)).toEqual(msg);
  });

  test("parses tool-call stream event", () => {
    const msg = {
      type: "agent_streaming" as const,
      ts,
      runId: "run-1",
      agentName: "coder",
      event: {
        type: "tool-call" as const,
        toolCallId: "call_1",
        toolName: "exec",
        args: '{"cmd":"ls"}',
      },
    };
    expect(AgentStreamingMessage.parse(msg)).toEqual(msg);
  });

  test("parses tool-result stream event", () => {
    const msg = {
      type: "agent_streaming" as const,
      ts,
      runId: "run-1",
      agentName: "coder",
      event: {
        type: "tool-result" as const,
        toolCallId: "call_1",
        toolName: "exec",
        output: "files",
        status: "completed" as const,
      },
    };
    expect(AgentStreamingMessage.parse(msg)).toEqual(msg);
  });

  test("parses step-start stream event", () => {
    const msg = {
      type: "agent_streaming" as const,
      ts,
      runId: "run-1",
      agentName: "coder",
      event: { type: "step-start" as const },
    };
    expect(AgentStreamingMessage.parse(msg)).toEqual(msg);
  });

  test("parses done stream event", () => {
    const msg = {
      type: "agent_streaming" as const,
      ts,
      runId: "run-1",
      agentName: "coder",
      event: {
        type: "done" as const,
        result: { ...agentResult, contextUsage: { totalTokens: 42 } },
      },
    };
    expect(AgentStreamingMessage.parse(msg)).toEqual(msg);
  });

  test("rejects unknown stream event type", () => {
    expect(
      AgentStreamingMessage.safeParse({
        type: "agent_streaming" as const,
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
        type: "agent_streaming" as const,
        ts,
        runId: "r",
        agentName: "a",
      }).success,
    ).toBe(false);
  });
});

describe("StepStartedMessage", () => {
  test("parses valid message", () => {
    const msg = {
      type: "step_started" as const,
      ts,
      runId: "run-1",
      stepName: "agent-a",
      message: "hello",
    };
    expect(StepStartedMessage.parse(msg)).toEqual(msg);
  });

  test("rejects missing stepName", () => {
    expect(
      StepStartedMessage.safeParse({
        type: "step_started" as const,
        ts,
        runId: "r",
        message: "m",
      }).success,
    ).toBe(false);
  });
});

describe("StepCompletedMessage", () => {
  test("parses valid message", () => {
    const msg = {
      type: "step_completed" as const,
      ts,
      runId: "run-1",
      stepName: "agent-a",
      result: agentResult,
    };
    expect(StepCompletedMessage.parse(msg)).toEqual(msg);
  });

  test("rejects missing result", () => {
    expect(
      StepCompletedMessage.safeParse({
        type: "step_completed" as const,
        ts,
        runId: "r",
        stepName: "s",
      }).success,
    ).toBe(false);
  });

  test("rejects result missing usage", () => {
    expect(
      StepCompletedMessage.safeParse({
        type: "step_completed" as const,
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
    const msg = {
      type: "request_input" as const,
      ts,
      runId: "run-1",
      agentName: "user-agent",
    };
    expect(RequestInputMessage.parse(msg)).toEqual(msg);
  });

  test("parses valid message with prompt", () => {
    const msg = {
      type: "request_input" as const,
      ts,
      runId: "run-1",
      agentName: "user-agent",
      prompt: "Enter name:",
    };
    expect(RequestInputMessage.parse(msg).prompt).toBe("Enter name:");
  });

  test("rejects missing agentName", () => {
    expect(
      RequestInputMessage.safeParse({
        type: "request_input" as const,
        ts,
        runId: "r",
      }).success,
    ).toBe(false);
  });
});

describe("StrategyListMessage", () => {
  test("parses valid message with runs", () => {
    const msg = {
      type: "strategy_list" as const,
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
    const msg = { type: "strategy_list" as const, ts, runs: [] };
    expect(StrategyListMessage.parse(msg).runs).toEqual([]);
  });

  test("rejects missing runs array", () => {
    expect(
      StrategyListMessage.safeParse({ type: "strategy_list" as const, ts })
        .success,
    ).toBe(false);
  });

  test("rejects run with invalid status", () => {
    expect(
      StrategyListMessage.safeParse({
        type: "strategy_list" as const,
        ts,
        runs: [
          { runId: "r", strategyName: "s", status: "paused", startedAt: ts },
        ],
      }).success,
    ).toBe(false);
  });
});

describe("PongMessage", () => {
  test("parses valid message", () => {
    expect(PongMessage.parse({ type: "pong" as const, ts })).toEqual({
      type: "pong" as const,
      ts,
    });
  });

  test("accepts requestId", () => {
    expect(
      PongMessage.parse({ type: "pong" as const, ts, requestId: "req-1" })
        .requestId,
    ).toBe("req-1");
  });

  test("rejects missing ts", () => {
    expect(PongMessage.safeParse({ type: "pong" }).success).toBe(false);
  });
});

describe("ErrorMessage", () => {
  test("parses valid message", () => {
    const msg = {
      type: "error" as const,
      ts,
      code: "INVALID_MESSAGE",
      message: "Bad JSON",
    };
    expect(ErrorMessage.parse(msg)).toEqual(msg);
  });

  test("accepts requestId for correlation", () => {
    const msg = {
      type: "error" as const,
      ts,
      code: "NOT_FOUND",
      message: "No run",
      requestId: "req-5",
    };
    expect(ErrorMessage.parse(msg).requestId).toBe("req-5");
  });

  test("rejects missing code", () => {
    expect(
      ErrorMessage.safeParse({ type: "error" as const, ts, message: "oops" })
        .success,
    ).toBe(false);
  });

  test("rejects missing message", () => {
    expect(
      ErrorMessage.safeParse({ type: "error" as const, ts, code: "ERR" })
        .success,
    ).toBe(false);
  });
});

// DaemonMessage discriminated union

describe("DaemonMessage union", () => {
  test("routes run_prepared correctly and defaults conversation inputs", () => {
    const result = DaemonMessage.parse({
      type: "run_prepared" as const,
      ts,
      runId: "r",
      strategyName: "s",
      agents: ["a"],
      flowTree: {},
      // Older payloads omit `inputs`; it must default to [] for back-compat.
      conversation: { records: [], retentionEvents: [] },
    });
    expect(result.type).toBe("run_prepared");
    if (result.type !== "run_prepared") throw new Error("unexpected type");
    expect(result.conversation.inputs).toEqual([]);
  });

  test("parses run_prepared conversation inputs", () => {
    const result = DaemonMessage.parse({
      type: "run_prepared" as const,
      ts,
      runId: "r",
      strategyName: "s",
      agents: ["a"],
      flowTree: {},
      conversation: {
        records: [],
        retentionEvents: [],
        inputs: [
          { text: "human prompt", beforeRecordId: "record-1" },
          { text: "trailing prompt" },
        ],
      },
    });
    expect(result.type).toBe("run_prepared");
    if (result.type !== "run_prepared") throw new Error("unexpected type");
    expect(result.conversation.inputs).toEqual([
      { text: "human prompt", beforeRecordId: "record-1" },
      { text: "trailing prompt" },
    ]);
  });

  test("preserves compacted conversation record tombstones", () => {
    const result = DaemonMessage.parse({
      type: "run_prepared" as const,
      ts,
      runId: "r",
      strategyName: "s",
      agents: ["a"],
      flowTree: {},
      conversation: {
        records: [
          {
            id: "record-1",
            agentName: "a",
            createdAt: ts,
            userMessage: { role: "user", content: "old" },
            responseMessages: [{ role: "assistant", content: "stale" }],
            text: "stale",
            usage,
            finishReason: "stop",
            status: "superseded",
            supersededBy: "summary-1",
          },
        ],
        retentionEvents: [
          {
            id: "retention-1",
            agentName: "a",
            createdAt: ts,
            kind: "compaction",
            reason: "context-window",
            trigger: {
              contextUsage: { totalTokens: 850 },
              tokenLimit: 1_000,
              ratio: 0.85,
              thresholdRatio: 0.85,
            },
            recordsCompacted: 1,
            recordsRetained: 1,
            summaryRecord: {
              id: "summary-1",
              agentName: "a",
              createdAt: ts,
              userMessage: { role: "user", content: "summary request" },
              responseMessages: [{ role: "assistant", content: "summary" }],
              text: "summary",
              usage,
              finishReason: "stop",
              status: "active",
            },
            supersededRecordIds: ["record-1"],
          },
        ],
      },
    });

    if (result.type !== "run_prepared") {
      throw new Error(`Expected run_prepared, got ${result.type}`);
    }
    expect(result.conversation.records[0]).toMatchObject({
      status: "superseded",
      supersededBy: "summary-1",
    });
    expect(result.conversation.retentionEvents).toHaveLength(1);
  });

  test("routes strategy_started correctly", () => {
    const result = DaemonMessage.parse({
      type: "strategy_started" as const,
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
      type: "strategy_completed" as const,
      ts,
      runId: "r",
      result: "ok",
      usage,
    });
    expect(result.type).toBe("strategy_completed");
  });

  test("routes strategy_error correctly", () => {
    const result = DaemonMessage.parse({
      type: "strategy_error" as const,
      ts,
      runId: "r",
      error: { code: "ERR", message: "fail" },
    });
    expect(result.type).toBe("strategy_error");
  });

  test("routes agent_output correctly", () => {
    const result = DaemonMessage.parse({
      type: "agent_output" as const,
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
      type: "agent_streaming" as const,
      ts,
      runId: "r",
      agentName: "a",
      event: { type: "text" as const, text: "hi" },
    });
    expect(result.type).toBe("agent_streaming");
  });

  test("routes step_started correctly", () => {
    const result = DaemonMessage.parse({
      type: "step_started" as const,
      ts,
      runId: "r",
      stepName: "s",
      message: "m",
    });
    expect(result.type).toBe("step_started");
  });

  test("routes step_completed correctly", () => {
    const result = DaemonMessage.parse({
      type: "step_completed" as const,
      ts,
      runId: "r",
      stepName: "s",
      result: agentResult,
    });
    expect(result.type).toBe("step_completed");
  });

  test("routes request_input correctly", () => {
    const result = DaemonMessage.parse({
      type: "request_input" as const,
      ts,
      runId: "r",
      agentName: "a",
    });
    expect(result.type).toBe("request_input");
  });

  test("routes strategy_list correctly", () => {
    const result = DaemonMessage.parse({
      type: "strategy_list" as const,
      ts,
      runs: [],
    });
    expect(result.type).toBe("strategy_list");
  });

  test("routes pong correctly", () => {
    const result = DaemonMessage.parse({ type: "pong" as const, ts });
    expect(result.type).toBe("pong");
  });

  test("routes error correctly", () => {
    const result = DaemonMessage.parse({
      type: "error" as const,
      ts,
      code: "ERR",
      message: "fail",
    });
    expect(result.type).toBe("error");
  });

  test("rejects unknown type", () => {
    expect(
      DaemonMessage.safeParse({ type: "unknown_msg" as const, ts }).success,
    ).toBe(false);
  });

  test("rejects removed run_loaded messages", () => {
    expect(
      DaemonMessage.safeParse({
        type: "run_loaded" as const,
        ts,
        runId: "r",
      }).success,
    ).toBe(false);
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
    const result = parseDaemonMessage({ type: "pong" as const, ts });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.type).toBe("pong");
    }
  });

  test("returns failure for invalid message", () => {
    const result = parseDaemonMessage({ type: "bad" as const, ts });
    expect(result.success).toBe(false);
  });

  test("handles non-object input", () => {
    expect(parseDaemonMessage("not json").success).toBe(false);
    expect(parseDaemonMessage(null).success).toBe(false);
    expect(parseDaemonMessage(42).success).toBe(false);
  });
});
