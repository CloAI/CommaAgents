import { describe, expect, it } from "bun:test";
import { contextDetails, contextTokensFromSteps } from "./context-usage";

describe("context usage", () => {
  it("uses only the final model step instead of aggregate call usage", () => {
    const steps = [
      { usage: { inputTokens: 10_000, outputTokens: 2_000 } },
      { usage: { inputTokens: 15_000, outputTokens: 3_000 } },
    ];

    expect(contextTokensFromSteps(steps)).toBe(18_000);
    expect(contextDetails({ steps })).toEqual({ contextTokens: 18_000 });
  });

  it("returns no context usage when the provider reports no step usage", () => {
    expect(contextTokensFromSteps([])).toBeUndefined();
    expect(contextDetails({ steps: [{ usage: {} }] })).toEqual({});
  });
});
