import { describe, expect, it } from "bun:test";
import { render } from "ink-testing-library";
import { ContextUsageModalRender } from "./ContextUsageModal";
import type { ContextUsageModalPayload } from "./ContextUsageModal.types";

function renderContextUsage(payload: ContextUsageModalPayload): string {
  const { lastFrame } = render(<ContextUsageModalRender payload={payload} />);
  return lastFrame() ?? "";
}

describe("ContextUsageModalRender", () => {
  it("renders total and detailed token usage", () => {
    const frame = renderContextUsage({
      agentName: "planner",
      model: "openai/gpt-5",
      contextWindow: 128_000,
      contextUsage: {
        totalTokens: 33_000,
        inputTokens: 32_000,
        outputTokens: 1_000,
        inputTokenDetails: {
          noCacheTokens: 30_000,
          cacheReadTokens: 1_500,
          cacheWriteTokens: 500,
        },
        outputTokenDetails: {
          textTokens: 700,
          reasoningTokens: 300,
        },
      },
    });

    expect(frame).toContain("model openai/gpt-5");
    expect(frame).toContain("window 33k/128k");
    expect(frame).toContain("total");
    expect(frame).toContain("33k");
    expect(frame).toContain("input (sent)");
    expect(frame).toContain("output (reply)");
    expect(frame).toContain("cache read");
    expect(frame).toContain("2k");
    expect(frame).toContain("reasoning");
    expect(frame).toContain("300");
  });

  it("renders partial usage without optional rows", () => {
    const frame = renderContextUsage({
      agentName: "writer",
      contextUsage: { totalTokens: 42 },
    });

    expect(frame).toContain("total");
    expect(frame).toContain("42");
    expect(frame).not.toContain("cache read");
    expect(frame).not.toContain("reasoning");
  });
});
