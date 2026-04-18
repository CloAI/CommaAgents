// Tests for token-tracking — createTokenTracker and useTokenTracking.

import { describe, expect, it } from "bun:test";
import { createAgent } from "../../../agents/agent/agent";
import type { AgentCallResult } from "../../../agents/agent/agent.types";
import { hookIntoAgent } from "../../../agents/hook-into-agent/hook-into-agent";
import { createTokenTracker, useTokenTracking } from "./token-tracking";
import type { TokenSnapshot } from "./token-tracking.types";

// -- createTokenTracker tests --

describe("createTokenTracker", () => {
  it("should return a tracker with an empty initial snapshot", () => {
    const tracker = createTokenTracker();
    const snap = tracker.snapshot();

    expect(snap.totalPromptTokens).toBe(0);
    expect(snap.totalCompletionTokens).toBe(0);
    expect(snap.totalTokens).toBe(0);
    expect(snap.callCount).toBe(0);
    expect(snap.lastPromptTokens).toBeUndefined();
    expect(snap.contextWindow).toBeUndefined();
    expect(snap.maxOutputTokens).toBeUndefined();
    expect(snap.contextUsagePercent).toBeUndefined();
    expect(snap.contextRemaining).toBeUndefined();
    expect(snap.calls).toEqual([]);
  });

  it("should accumulate token usage across multiple records", () => {
    const tracker = createTokenTracker();

    tracker.record(100, 50);
    tracker.record(200, 75);

    const snap = tracker.snapshot();

    expect(snap.totalPromptTokens).toBe(300);
    expect(snap.totalCompletionTokens).toBe(125);
    expect(snap.totalTokens).toBe(425);
    expect(snap.callCount).toBe(2);
    expect(snap.lastPromptTokens).toBe(200);
    expect(snap.calls).toHaveLength(2);
  });

  it("should track individual call records with timestamps", () => {
    const tracker = createTokenTracker();

    tracker.record(100, 50);
    const snap = tracker.snapshot();

    expect(snap.calls).toHaveLength(1);
    expect(snap.calls[0]!.promptTokens).toBe(100);
    expect(snap.calls[0]!.completionTokens).toBe(50);
    expect(snap.calls[0]!.totalTokens).toBe(150);
    expect(typeof snap.calls[0]!.timestamp).toBe("number");
  });

  it("should clear all data on reset", () => {
    const tracker = createTokenTracker();

    tracker.record(100, 50);
    tracker.record(200, 75);
    tracker.reset();

    const snap = tracker.snapshot();
    expect(snap.totalTokens).toBe(0);
    expect(snap.callCount).toBe(0);
    expect(snap.calls).toEqual([]);
  });

  describe("with model metadata from catalog", () => {
    it("should include context window info for known models", () => {
      const tracker = createTokenTracker({ model: "openai/gpt-4o" });
      const snap = tracker.snapshot();

      expect(snap.contextWindow).toBe(128_000);
      expect(snap.maxOutputTokens).toBe(16_384);
    });

    it("should compute context usage percent after a call", () => {
      const tracker = createTokenTracker({ model: "openai/gpt-4o" });

      // Simulate a call that used 64,000 prompt tokens (50% of 128K)
      tracker.record(64_000, 500);
      const snap = tracker.snapshot();

      expect(snap.contextUsagePercent).toBe(0.5);
      expect(snap.contextRemaining).toBe(64_000);
    });

    it("should use the last call's prompt tokens for budget calculation", () => {
      const tracker = createTokenTracker({ model: "openai/gpt-4o" });

      tracker.record(32_000, 500);
      tracker.record(96_000, 800);

      const snap = tracker.snapshot();

      // Budget should reflect the last call (96K), not cumulative
      expect(snap.contextUsagePercent).toBe(0.75);
      expect(snap.contextRemaining).toBe(32_000);
    });

    it("should clamp contextRemaining to zero when over limit", () => {
      const tracker = createTokenTracker({
        modelMetadata: { contextWindow: 1000 },
      });

      // Prompt tokens exceed context window (shouldn't happen in practice,
      // but the tracker should handle it gracefully)
      tracker.record(1200, 100);
      const snap = tracker.snapshot();

      expect(snap.contextRemaining).toBe(0);
      expect(snap.contextUsagePercent).toBe(1.2);
    });
  });

  describe("with explicit model metadata", () => {
    it("should use explicit metadata over catalog", () => {
      const tracker = createTokenTracker({
        model: "openai/gpt-4o",
        modelMetadata: { contextWindow: 50_000, maxOutputTokens: 2_000 },
      });

      const snap = tracker.snapshot();

      // Explicit metadata should take precedence
      expect(snap.contextWindow).toBe(50_000);
      expect(snap.maxOutputTokens).toBe(2_000);
    });

    it("should work with metadata that has no maxOutputTokens", () => {
      const tracker = createTokenTracker({
        modelMetadata: { contextWindow: 10_000 },
      });

      tracker.record(5_000, 200);
      const snap = tracker.snapshot();

      expect(snap.contextWindow).toBe(10_000);
      expect(snap.maxOutputTokens).toBeUndefined();
      expect(snap.contextUsagePercent).toBe(0.5);
      expect(snap.contextRemaining).toBe(5_000);
    });
  });

  describe("with unknown model", () => {
    it("should have undefined context budget for models not in catalog", () => {
      const tracker = createTokenTracker({ model: "custom/my-model" });

      tracker.record(1000, 200);
      const snap = tracker.snapshot();

      expect(snap.contextWindow).toBeUndefined();
      expect(snap.contextUsagePercent).toBeUndefined();
      expect(snap.contextRemaining).toBeUndefined();
      // Usage tracking still works
      expect(snap.totalTokens).toBe(1200);
    });
  });

  describe("snapshot immutability", () => {
    it("should return independent snapshots", () => {
      const tracker = createTokenTracker();

      tracker.record(100, 50);
      const snap1 = tracker.snapshot();

      tracker.record(200, 75);
      const snap2 = tracker.snapshot();

      // snap1 should not be affected by the second record
      expect(snap1.totalTokens).toBe(150);
      expect(snap1.callCount).toBe(1);

      expect(snap2.totalTokens).toBe(425);
      expect(snap2.callCount).toBe(2);
    });
  });
});

// -- useTokenTracking tests --

/** Create a mock agent with custom execute that reports specific token usage. */
function makeMockAgent(name: string, usage: { promptTokens: number; completionTokens: number }) {
  return createAgent({
    name,
    execute: async (message) => ({
      text: `Response to: ${message}`,
      responseMessages: [{ role: "assistant" as const, content: `Response to: ${message}` }],
      steps: [],
      usage,
      finishReason: "stop",
    }),
  });
}

describe("useTokenTracking", () => {
  it("should return a TokenTracker that records usage from agent calls", async () => {
    const agent = makeMockAgent("test", { promptTokens: 150, completionTokens: 50 });
    const tracker = useTokenTracking(agent);

    await agent.call("hello");
    const snap = tracker.snapshot();

    expect(snap.totalPromptTokens).toBe(150);
    expect(snap.totalCompletionTokens).toBe(50);
    expect(snap.totalTokens).toBe(200);
    expect(snap.callCount).toBe(1);
  });

  it("should accumulate across multiple calls", async () => {
    const agent = makeMockAgent("test", { promptTokens: 100, completionTokens: 25 });
    const tracker = useTokenTracking(agent);

    await agent.call("first");
    await agent.call("second");
    await agent.call("third");

    const snap = tracker.snapshot();

    expect(snap.totalPromptTokens).toBe(300);
    expect(snap.totalCompletionTokens).toBe(75);
    expect(snap.totalTokens).toBe(375);
    expect(snap.callCount).toBe(3);
    expect(snap.lastPromptTokens).toBe(100);
  });

  it("should include context budget when model metadata is provided via config", async () => {
    const agent = makeMockAgent("test", { promptTokens: 64_000, completionTokens: 1_000 });
    const tracker = useTokenTracking(agent, { model: "openai/gpt-4o" });

    await agent.call("test");
    const snap = tracker.snapshot();

    expect(snap.contextWindow).toBe(128_000);
    expect(snap.contextUsagePercent).toBe(0.5);
    expect(snap.contextRemaining).toBe(64_000);
  });

  it("should accept explicit modelMetadata to override catalog", async () => {
    const agent = makeMockAgent("test", { promptTokens: 5_000, completionTokens: 200 });
    const tracker = useTokenTracking(agent, {
      modelMetadata: { contextWindow: 10_000, maxOutputTokens: 2_000 },
    });

    await agent.call("test");
    const snap = tracker.snapshot();

    expect(snap.contextWindow).toBe(10_000);
    expect(snap.maxOutputTokens).toBe(2_000);
    expect(snap.contextUsagePercent).toBe(0.5);
    expect(snap.contextRemaining).toBe(5_000);
  });

  it("should work with no context budget for unknown models", async () => {
    const agent = makeMockAgent("test", { promptTokens: 1_000, completionTokens: 200 });
    const tracker = useTokenTracking(agent);

    await agent.call("test");
    const snap = tracker.snapshot();

    // No model metadata — budget fields are undefined
    expect(snap.contextWindow).toBeUndefined();
    expect(snap.contextUsagePercent).toBeUndefined();
    expect(snap.contextRemaining).toBeUndefined();
    // Usage tracking still works
    expect(snap.totalTokens).toBe(1_200);
  });

  it("should work alongside other hooks without interference", async () => {
    const log: string[] = [];

    const agent = createAgent({
      name: "hooked",
      execute: async (message): Promise<AgentCallResult> => ({
        text: message,
        responseMessages: [{ role: "assistant", content: message }],
        steps: [],
        usage: { promptTokens: 100, completionTokens: 50 },
        finishReason: "stop",
      }),
    });

    hookIntoAgent(agent, {
      afterCallResult: [async (result) => log.push(`afterCallResult: ${result.text}`)],
    });

    const tracker = useTokenTracking(agent);
    await agent.call("test");

    // Both hooks should fire
    expect(log).toEqual(["afterCallResult: test"]);
    expect(tracker.snapshot().totalTokens).toBe(150);
  });

  it("should respect tracker reset", async () => {
    const agent = makeMockAgent("test", { promptTokens: 100, completionTokens: 50 });
    const tracker = useTokenTracking(agent);

    await agent.call("first");
    expect(tracker.snapshot().callCount).toBe(1);

    tracker.reset();
    expect(tracker.snapshot().callCount).toBe(0);

    await agent.call("after reset");
    expect(tracker.snapshot().callCount).toBe(1);
    expect(tracker.snapshot().totalTokens).toBe(150);
  });
});
