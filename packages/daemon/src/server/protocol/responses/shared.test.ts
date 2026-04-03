// Tests for shared response schemas (UsageSchema, AgentCallResultSchema).

import { describe, expect, test } from "bun:test";
import { AgentCallResultSchema, UsageSchema } from "./shared";

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
