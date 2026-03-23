// Tests for shared protocol schemas.

import { describe, expect, test } from "bun:test";
import {
  AgentCallResultSchema,
  AgentStreamEventSchema,
  ClientBase,
  DaemonBase,
  ErrorInfoSchema,
  RunSummarySchema,
  UsageSchema,
} from "./shared";

// ClientBase

describe("ClientBase", () => {
  test("accepts empty object", () => {
    expect(ClientBase.parse({})).toEqual({});
  });

  test("accepts requestId", () => {
    const result = ClientBase.parse({ requestId: "req-1" });
    expect(result.requestId).toBe("req-1");
  });

  test("strips unknown fields", () => {
    const result = ClientBase.parse({ requestId: "req-1", extra: true });
    expect(result).toEqual({ requestId: "req-1" });
  });
});

// DaemonBase

describe("DaemonBase", () => {
  const ts = "2026-03-01T12:00:00.000Z";

  test("requires ts as ISO datetime", () => {
    expect(DaemonBase.parse({ ts })).toEqual({ ts });
  });

  test("accepts requestId + ts", () => {
    const result = DaemonBase.parse({ requestId: "req-2", ts });
    expect(result).toEqual({ requestId: "req-2", ts });
  });

  test("rejects missing ts", () => {
    expect(DaemonBase.safeParse({}).success).toBe(false);
  });

  test("rejects non-ISO ts", () => {
    expect(DaemonBase.safeParse({ ts: "not-a-date" }).success).toBe(false);
  });

  test("rejects ts without time zone", () => {
    // datetime() requires a timezone offset
    expect(DaemonBase.safeParse({ ts: "2026-03-01T12:00:00" }).success).toBe(false);
  });
});

// UsageSchema

describe("UsageSchema", () => {
  test("parses valid usage", () => {
    expect(UsageSchema.parse({ promptTokens: 10, completionTokens: 20 })).toEqual({
      promptTokens: 10,
      completionTokens: 20,
    });
  });

  test("rejects missing fields", () => {
    expect(UsageSchema.safeParse({ promptTokens: 10 }).success).toBe(false);
    expect(UsageSchema.safeParse({ completionTokens: 20 }).success).toBe(false);
  });

  test("rejects non-number tokens", () => {
    expect(UsageSchema.safeParse({ promptTokens: "10", completionTokens: 20 }).success).toBe(false);
  });
});

// ErrorInfoSchema

describe("ErrorInfoSchema", () => {
  test("parses valid error info", () => {
    expect(ErrorInfoSchema.parse({ code: "NOT_FOUND", message: "Run not found" })).toEqual({
      code: "NOT_FOUND",
      message: "Run not found",
    });
  });

  test("rejects missing code", () => {
    expect(ErrorInfoSchema.safeParse({ message: "oops" }).success).toBe(false);
  });

  test("rejects missing message", () => {
    expect(ErrorInfoSchema.safeParse({ code: "ERR" }).success).toBe(false);
  });
});

// AgentCallResultSchema

describe("AgentCallResultSchema", () => {
  const valid = {
    text: "hello",
    usage: { promptTokens: 5, completionTokens: 3 },
    finishReason: "stop",
  };

  test("parses valid result", () => {
    expect(AgentCallResultSchema.parse(valid)).toEqual(valid);
  });

  test("rejects missing text", () => {
    const { text: _, ...rest } = valid;
    expect(AgentCallResultSchema.safeParse(rest).success).toBe(false);
  });

  test("rejects missing usage", () => {
    const { usage: _, ...rest } = valid;
    expect(AgentCallResultSchema.safeParse(rest).success).toBe(false);
  });

  test("rejects missing finishReason", () => {
    const { finishReason: _, ...rest } = valid;
    expect(AgentCallResultSchema.safeParse(rest).success).toBe(false);
  });
});

// RunSummarySchema

describe("RunSummarySchema", () => {
  const valid = {
    runId: "run-1",
    strategyName: "test-strategy",
    status: "running" as const,
    startedAt: "2026-03-01T12:00:00.000Z",
  };

  test("parses valid summary without completedAt", () => {
    expect(RunSummarySchema.parse(valid)).toEqual(valid);
  });

  test("parses valid summary with completedAt", () => {
    const withCompleted = { ...valid, completedAt: "2026-03-01T12:05:00.000Z" };
    expect(RunSummarySchema.parse(withCompleted)).toEqual(withCompleted);
  });

  test("accepts all status values", () => {
    for (const status of ["running", "completed", "error", "cancelled"]) {
      expect(RunSummarySchema.parse({ ...valid, status }).status).toBe(status);
    }
  });

  test("rejects invalid status", () => {
    expect(RunSummarySchema.safeParse({ ...valid, status: "paused" }).success).toBe(false);
  });

  test("rejects non-ISO startedAt", () => {
    expect(RunSummarySchema.safeParse({ ...valid, startedAt: "yesterday" }).success).toBe(false);
  });
});

// AgentStreamEventSchema

describe("AgentStreamEventSchema", () => {
  test("parses text event", () => {
    expect(AgentStreamEventSchema.parse({ type: "text", text: "hello" })).toEqual({
      type: "text",
      text: "hello",
    });
  });

  test("parses tool-call event", () => {
    expect(
      AgentStreamEventSchema.parse({ type: "tool-call", toolName: "search", args: '{"q":"test"}' }),
    ).toEqual({ type: "tool-call", toolName: "search", args: '{"q":"test"}' });
  });

  test("parses tool-result event", () => {
    expect(
      AgentStreamEventSchema.parse({ type: "tool-result", toolName: "search", output: "result" }),
    ).toEqual({ type: "tool-result", toolName: "search", output: "result" });
  });

  test("parses step-start event", () => {
    expect(AgentStreamEventSchema.parse({ type: "step-start" })).toEqual({ type: "step-start" });
  });

  test("parses done event", () => {
    const result = {
      text: "done",
      usage: { promptTokens: 1, completionTokens: 2 },
      finishReason: "stop",
    };
    expect(AgentStreamEventSchema.parse({ type: "done", result })).toEqual({
      type: "done",
      result,
    });
  });

  test("rejects unknown event type", () => {
    expect(AgentStreamEventSchema.safeParse({ type: "unknown" }).success).toBe(false);
  });

  test("rejects text event without text field", () => {
    expect(AgentStreamEventSchema.safeParse({ type: "text" }).success).toBe(false);
  });

  test("rejects tool-call without toolName", () => {
    expect(AgentStreamEventSchema.safeParse({ type: "tool-call", args: "{}" }).success).toBe(false);
  });

  test("rejects done event without result", () => {
    expect(AgentStreamEventSchema.safeParse({ type: "done" }).success).toBe(false);
  });
});
