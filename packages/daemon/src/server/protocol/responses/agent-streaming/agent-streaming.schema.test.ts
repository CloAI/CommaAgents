// Tests for AgentStreamEventSchema.

import { describe, expect, test } from "bun:test";
import { AgentStreamEventSchema } from "./agent-streaming.schema";

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
