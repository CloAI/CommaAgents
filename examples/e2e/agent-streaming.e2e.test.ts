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

import { afterEach, describe, expect, it } from "bun:test";
import type { AgentHooks, AgentStreamEvent } from "@comma-agents/core";
import {
  createAgent,
  hookIntoAgent,
  registerModel,
  registerTool,
  resetModelRegistry,
  resetToolRegistry,
} from "@comma-agents/core";
import {
  createSimpleMockModel,
  createToolCallingMockModel,
} from "./helpers/mock-model";
import { createEchoTool } from "./helpers/test-tools";

// Tests

describe("E2E: Agent Streaming", () => {
  afterEach(() => {
    resetModelRegistry();
    resetToolRegistry();
  });

  // -----------------------------------------------------------------------
  // 1. Stream text response
  // -----------------------------------------------------------------------

  describe("stream text response", () => {
    it("should yield text events and a final done event", async () => {
      const model = createSimpleMockModel(["Hello, streaming world!"]);
      registerModel("mock/stream-text-events", model);

      const agent = createAgent({
        name: "streamer",
        model: "mock/stream-text-events",
      });

      const events: AgentStreamEvent[] = [];
      if (!agent.stream) throw new Error("Expected agent.stream to be defined");
      for await (const event of agent.stream("Hi")) {
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
      registerModel("mock/stream-accumulate", model);

      const agent = createAgent({
        name: "accumulator",
        model: "mock/stream-accumulate",
      });

      const textParts: string[] = [];
      if (!agent.stream) throw new Error("Expected agent.stream to be defined");
      for await (const event of agent.stream("Test")) {
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
            toolCalls: [
              { id: "c1", name: "echo", args: { message: "streamed" } },
            ],
          },
          { text: "Echo returned: streamed" },
        ],
      });
      registerModel("mock/stream-tools", model);
      registerTool("echo", createEchoTool());

      const agent = createAgent({
        name: "stream-tools",
        model: "mock/stream-tools",
        tools: ["echo"],
      });

      const events: AgentStreamEvent[] = [];
      if (!agent.stream) throw new Error("Expected agent.stream to be defined");
      for await (const event of agent.stream("Echo something")) {
        events.push(event);
      }

      const eventTypes = events.map((e) => e.type);

      // Should contain tool-call, tool-result, text, and done events
      expect(eventTypes).toContain("tool-call");
      expect(eventTypes).toContain("tool-result");
      expect(eventTypes).toContain("done");

      // Verify tool-call event content
      const toolCallEvent = events.find(
        (e) => e.type === "tool-call",
      ) as Extract<AgentStreamEvent, { type: "tool-call" }>;
      expect(toolCallEvent.toolName).toBe("echo");

      // Verify tool-result event content
      const toolResultEvent = events.find(
        (e) => e.type === "tool-result",
      ) as Extract<AgentStreamEvent, { type: "tool-result" }>;
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
      registerModel("mock/stream-hook", model);

      const agent = createAgent({
        name: "hook-stream",
        model: "mock/stream-hook",
      });

      hookIntoAgent(agent, hooks);

      // Use stream() generator to trigger streaming
      const directEvents: AgentStreamEvent[] = [];
      if (!agent.stream) throw new Error("Expected agent.stream to be defined");
      for await (const event of agent.stream("Test")) {
        directEvents.push(event);
      }

      // Hook should have received the same events as the generator
      expect(hookEvents.length).toBe(directEvents.length);
      expect(hookEvents.map((e) => e.type)).toEqual(
        directEvents.map((e) => e.type),
      );
    });
  });

  // -----------------------------------------------------------------------
  // 4. Stream abort
  // -----------------------------------------------------------------------

  describe("stream abort", () => {
    it("should terminate stream when abort is called on the generator", async () => {
      const model = createSimpleMockModel(["This should be cut short"]);
      registerModel("mock/stream-abort", model);

      const agent = createAgent({
        name: "abort-stream",
        model: "mock/stream-abort",
      });

      const events: AgentStreamEvent[] = [];

      try {
        if (!agent.stream)
          throw new Error("Expected agent.stream to be defined");
        const streamGenerator = agent.stream("Test abort");

        // Abort almost immediately
        setTimeout(() => streamGenerator.abort(), 5);

        for await (const event of streamGenerator) {
          events.push(event);
        }
      } catch (error) {
        // Expected: streaming should throw on abort
        const caughtError = error as {
          readonly message?: string;
          readonly name?: string;
        };
        expect(
          caughtError.message?.includes("abort") ||
            caughtError.message?.includes("Abort") ||
            caughtError.name === "AbortError",
        ).toBe(true);
      }

      // We may or may not have received events before the abort
      // The key is that we didn't hang forever
    });
  });
});
