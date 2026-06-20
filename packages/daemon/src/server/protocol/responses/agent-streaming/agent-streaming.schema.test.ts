// Tests for AgentStreamEventSchema.

import { describe, expect, test } from "bun:test";
import { AgentStreamEventSchema } from "./agent-streaming.schema";

describe("AgentStreamEventSchema", () => {
  test("parses retention event", () => {
    const summaryRecord = {
      id: "summary-1",
      agentName: "writer",
      createdAt: "2026-01-01T00:00:00.000Z",
      userMessage: { role: "user", content: "summary request" },
      responseMessages: [{ role: "assistant", content: "summary" }],
      text: "summary",
      usage: { promptTokens: 0, completionTokens: 0 },
      finishReason: "stop",
      status: "active",
    } as const;
    const event = {
      type: "retention",
      event: {
        id: "retention-1",
        agentName: "writer",
        createdAt: "2026-01-01T00:00:00.000Z",
        kind: "compaction",
        reason: "context-window",
        trigger: {
          model: "mock/windowed",
          contextUsage: { totalTokens: 850 },
          tokenLimit: 1000,
          ratio: 0.85,
          thresholdRatio: 0.85,
        },
        recordsCompacted: 3,
        recordsRetained: 2,
        summaryRecord,
        supersededRecordIds: ["1", "2", "3"],
        insertBeforeRecordId: "4",
      },
    } as const;

    expect(AgentStreamEventSchema.parse(event)).toEqual(event);
  });

  test("parses text event", () => {
    expect(
      AgentStreamEventSchema.parse({ type: "text", text: "hello" }),
    ).toEqual({
      type: "text",
      text: "hello",
    });
  });

  test("parses tool-call event", () => {
    const event = {
      type: "tool-call",
      toolCallId: "call_abc",
      toolName: "search",
      args: '{"q":"test"}',
    } as const;
    expect(AgentStreamEventSchema.parse(event)).toEqual(event);
  });

  test("parses tool-result event with completed status", () => {
    const event = {
      type: "tool-result",
      toolCallId: "call_abc",
      toolName: "search",
      output: "result",
      status: "completed",
    } as const;
    expect(AgentStreamEventSchema.parse(event)).toEqual(event);
  });

  test("parses tool-result event with error status and message", () => {
    const event = {
      type: "tool-result",
      toolCallId: "call_abc",
      toolName: "search",
      output: "",
      status: "error",
      error: "ENOENT: no such file",
    } as const;
    expect(AgentStreamEventSchema.parse(event)).toEqual(event);
  });

  test("parses step-start event", () => {
    expect(AgentStreamEventSchema.parse({ type: "step-start" })).toEqual({
      type: "step-start",
    });
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
    expect(AgentStreamEventSchema.safeParse({ type: "unknown" }).success).toBe(
      false,
    );
  });

  test("rejects text event without text field", () => {
    expect(AgentStreamEventSchema.safeParse({ type: "text" }).success).toBe(
      false,
    );
  });

  test("rejects tool-call without toolName", () => {
    expect(
      AgentStreamEventSchema.safeParse({
        type: "tool-call",
        toolCallId: "c1",
        args: "{}",
      }).success,
    ).toBe(false);
  });

  test("rejects tool-call without toolCallId", () => {
    expect(
      AgentStreamEventSchema.safeParse({
        type: "tool-call",
        toolName: "search",
        args: "{}",
      }).success,
    ).toBe(false);
  });

  test("rejects tool-result without status", () => {
    expect(
      AgentStreamEventSchema.safeParse({
        type: "tool-result",
        toolCallId: "c1",
        toolName: "search",
        output: "ok",
      }).success,
    ).toBe(false);
  });

  test("rejects tool-result with unknown status", () => {
    expect(
      AgentStreamEventSchema.safeParse({
        type: "tool-result",
        toolCallId: "c1",
        toolName: "search",
        output: "ok",
        status: "running",
      }).success,
    ).toBe(false);
  });

  test("rejects done event without result", () => {
    expect(AgentStreamEventSchema.safeParse({ type: "done" }).success).toBe(
      false,
    );
  });
});
