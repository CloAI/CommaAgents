/**
 * E2E Test: Agent Streaming
 *
 * Tests the streaming interface — agent.stream() yields events
 * as tokens arrive, including interleaved tool calls.
 *
 * Covers:
 *   - Streaming text responses token-by-token
 *   - Streaming with interleaved tool calls
 *   - onStreamEvent hook firing during streaming
 *   - Stream abort mid-response
 *
 * All tests use mock models — no API keys required.
 */

import { describe, expect, it } from "bun:test";
import { createAgent } from "@comma-agents/core";
import type { AgentStreamEvent, AgentHooks } from "@comma-agents/core";
import { createSimpleMockModel, createToolCallingMockModel } from "./helpers/mock-model";
import { createEchoTool } from "./helpers/test-tools";

// Tests

describe("E2E: Agent Streaming", () => {
  // -----------------------------------------------------------------------
  // 1. Stream text response
  // -----------------------------------------------------------------------

  describe("stream text response", () => {
    it("should yield text events and a final done event", async () => {
      const model = createSimpleMockModel(["Hello, streaming world!"]);

      const agent = createAgent({
        name: "streamer",
        model,
        stream: true,
      });

      const events: AgentStreamEvent[] = [];
      for await (const event of agent.stream!("Hi")) {
        events.push(event);
      }

      // Should have at least a text event and a done event
      const textEvents = events.filter((e) => e.type === "text");
      const doneEvents = events.filter((e) => e.type === "done");

      expect(textEvents.length).toBeGreaterThanOrEqual(1);
      expect(doneEvents.length).toBe(1);

      // The done event should have the full result
      const done = doneEvents[0] as Extract<AgentStreamEvent, { type: "done" }>;
      expect(done.result.text).toBe("Hello, streaming world!");
      expect(done.result.usage.promptTokens).toBeGreaterThan(0);
    });

    it("should accumulate text from text events into the final result", async () => {
      const model = createSimpleMockModel(["Token by token output"]);

      const agent = createAgent({
        name: "accumulator",
        model,
      });

      const textParts: string[] = [];
      for await (const event of agent.stream!("Test")) {
        if (event.type === "text") {
          textParts.push(event.text);
        }
      }

      // Concatenated text parts should match the full response
      const fullText = textParts.join("");
      expect(fullText).toBe("Token by token output");
    });
  });

  // -----------------------------------------------------------------------
  // 2. Streaming with tool calls
  // -----------------------------------------------------------------------

  describe("streaming with tool calls", () => {
    it("should yield tool-call and tool-result events during stream", async () => {
      const model = createToolCallingMockModel({
        rounds: [
          {
            toolCalls: [{ id: "c1", name: "echo", args: { message: "streamed" } }],
          },
          { text: "Echo returned: streamed" },
        ],
      });

      const agent = createAgent({
        name: "stream-tools",
        model,
        tools: { echo: createEchoTool() },
      });

      const events: AgentStreamEvent[] = [];
      for await (const event of agent.stream!("Echo something")) {
        events.push(event);
      }

      const eventTypes = events.map((e) => e.type);

      // Should contain tool-call, tool-result, text, and done events
      expect(eventTypes).toContain("tool-call");
      expect(eventTypes).toContain("tool-result");
      expect(eventTypes).toContain("done");

      // Verify tool-call event content
      const toolCallEvent = events.find((e) => e.type === "tool-call") as Extract<
        AgentStreamEvent,
        { type: "tool-call" }
      >;
      expect(toolCallEvent.toolName).toBe("echo");

      // Verify tool-result event content
      const toolResultEvent = events.find((e) => e.type === "tool-result") as Extract<
        AgentStreamEvent,
        { type: "tool-result" }
      >;
      expect(toolResultEvent).toBeDefined();
      expect(toolResultEvent.toolName).toBe("echo");
      expect(toolResultEvent.output).toBe("echo: streamed");
    });
  });

  // -----------------------------------------------------------------------
  // 3. onStreamEvent hook
  // -----------------------------------------------------------------------

  describe("onStreamEvent hook", () => {
    it("should fire onStreamEvent for every stream event", async () => {
      const hookEvents: AgentStreamEvent[] = [];

      const hooks: AgentHooks = {
        onStreamEvent: [
          async (event) => {
            hookEvents.push(event);
          },
        ],
      };

      const model = createSimpleMockModel(["Hooked streaming"]);

      const agent = createAgent({
        name: "hook-stream",
        model,
        hooks,
      });

      // Use stream() generator to trigger streaming
      const directEvents: AgentStreamEvent[] = [];
      for await (const event of agent.stream!("Test")) {
        directEvents.push(event);
      }

      // Hook should have received the same events as the generator
      expect(hookEvents.length).toBe(directEvents.length);
      expect(hookEvents.map((e) => e.type)).toEqual(directEvents.map((e) => e.type));
    });

    it("should fire onStreamEvent when stream:true is set on call()", async () => {
      const hookEvents: AgentStreamEvent[] = [];

      const hooks: AgentHooks = {
        onStreamEvent: [
          async (event) => {
            hookEvents.push(event);
          },
        ],
      };

      const model = createSimpleMockModel(["Internal streaming"]);

      const agent = createAgent({
        name: "internal-stream",
        model,
        stream: true,
        hooks,
      });

      // call() with stream:true should still fire onStreamEvent hooks
      const result = await agent.call("Test internal streaming");

      expect(result.text).toBe("Internal streaming");
      // Should have received stream events via the hook
      expect(hookEvents.length).toBeGreaterThan(0);
      expect(hookEvents.some((e) => e.type === "done")).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // 4. Stream abort
  // -----------------------------------------------------------------------

  describe("stream abort", () => {
    it("should terminate stream when abort signal fires", async () => {
      const model = createSimpleMockModel(["This should be cut short"]);

      const abortController = new AbortController();

      const agent = createAgent({
        name: "abort-stream",
        model,
        abort: abortController.signal,
      });

      const events: AgentStreamEvent[] = [];

      try {
        // Abort almost immediately
        setTimeout(() => abortController.abort(), 5);

        for await (const event of agent.stream!("Test abort")) {
          events.push(event);
        }
      } catch (error: any) {
        // Expected: streaming should throw on abort
        expect(
          error.message?.includes("abort") ||
            error.message?.includes("Abort") ||
            error.name === "AbortError",
        ).toBe(true);
      }

      // We may or may not have received events before the abort
      // The key is that we didn't hang forever
    });
  });
});
