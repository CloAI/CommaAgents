// Tests for BaseAgent

import { describe, expect, it, mock } from "bun:test";
import type { LanguageModel } from "ai";
import { z } from "zod";
import { AgentCallError } from "../errors/index";
import type { AgentHooks, ToolHooks } from "../hooks/types";
import { BaseAgent } from "./base-agent";

// ---------------------------------------------------------------------------
// Mock model factory
// ---------------------------------------------------------------------------

/**
 * Creates a minimal mock LanguageModel that returns predetermined responses.
 *
 * Uses specificationVersion "v3" to match ai@6.x (AI SDK v3 provider spec).
 * The doGenerate response must include a `content` array and structured
 * `finishReason` / `usage` objects.
 */
function createMockModel(responses: string[]): LanguageModel {
  let callIndex = 0;

  const makeUsage = () => ({
    inputTokens: {
      total: 10,
      noCache: undefined,
      cacheRead: undefined,
      cacheWrite: undefined,
    },
    outputTokens: { total: 20, text: undefined, reasoning: undefined },
  });

  const makeFinishReason = () => ({
    unified: "stop" as const,
    raw: undefined,
  });

  return {
    modelId: "mock-model",
    specificationVersion: "v3",
    provider: "mock",
    defaultObjectGenerationMode: undefined,

    doGenerate: async () => {
      const text = responses[callIndex] ?? responses[responses.length - 1] ?? "";
      callIndex++;
      return {
        content: [{ type: "text" as const, text }],
        finishReason: makeFinishReason(),
        usage: makeUsage(),
        warnings: [],
      };
    },

    doStream: async () => {
      const text = responses[callIndex] ?? responses[responses.length - 1] ?? "";
      callIndex++;
      return {
        stream: new ReadableStream({
          start(controller) {
            const textId = "text-0";
            controller.enqueue({
              type: "text-start" as const,
              id: textId,
            });
            controller.enqueue({
              type: "text-delta" as const,
              delta: text,
              id: textId,
            });
            controller.enqueue({
              type: "text-end" as const,
              id: textId,
            });
            controller.enqueue({
              type: "finish" as const,
              finishReason: makeFinishReason(),
              usage: makeUsage(),
            });
            controller.close();
          },
        }),
      };
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Mock doesn't need full interface
  } as any;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("BaseAgent", () => {
  describe("constructor", () => {
    it("should set name from config", () => {
      const agent = new BaseAgent({
        name: "test-agent",
        model: createMockModel(["hello"]),
      });
      expect(agent.name).toBe("test-agent");
    });

    it("should store config", () => {
      const model = createMockModel(["hello"]);
      const agent = new BaseAgent({
        name: "test",
        model,
        systemPrompt: "You are helpful.",
        temperature: 0.7,
      });
      expect(agent.config.systemPrompt).toBe("You are helpful.");
      expect(agent.config.temperature).toBe(0.7);
    });
  });

  describe("call", () => {
    it("should return the model response as text", async () => {
      const agent = new BaseAgent({
        name: "test",
        model: createMockModel(["Hello, world!"]),
      });

      const result = await agent.call("Say hello");
      expect(result.text).toBe("Hello, world!");
      expect(result.finishReason).toBe("stop");
    });

    it("should track usage", async () => {
      const agent = new BaseAgent({
        name: "test",
        model: createMockModel(["response"]),
      });

      const result = await agent.call("test");
      expect(result.usage.promptTokens).toBeGreaterThanOrEqual(0);
      expect(result.usage.completionTokens).toBeGreaterThanOrEqual(0);
    });

    it("should maintain conversation history", async () => {
      const agent = new BaseAgent({
        name: "test",
        model: createMockModel(["first response", "second response"]),
      });

      await agent.call("first message");
      const history = agent.getHistory();

      expect(history).toHaveLength(2);
      expect(history[0]).toEqual({ role: "user", content: "first message" });
      expect(history[1]).toEqual({ role: "assistant", content: "first response" });
    });

    it("should accumulate history across calls", async () => {
      const agent = new BaseAgent({
        name: "test",
        model: createMockModel(["resp1", "resp2"]),
      });

      await agent.call("msg1");
      await agent.call("msg2");

      const history = agent.getHistory();
      expect(history).toHaveLength(4);
      expect(history[2]).toEqual({ role: "user", content: "msg2" });
    });
  });

  describe("hooks", () => {
    it("should run alterCallMessage hooks", async () => {
      const agent = new BaseAgent({
        name: "test",
        model: createMockModel(["response"]),
        hooks: {
          alterCallMessage: [(msg) => `[modified] ${msg}`],
        },
      });

      await agent.call("original");
      // Check that history has the modified message
      const history = agent.getHistory();
      expect(history[0]?.content).toBe("[modified] original");
    });

    it("should run alterResponse hooks", async () => {
      const agent = new BaseAgent({
        name: "test",
        model: createMockModel(["raw response"]),
        hooks: {
          alterResponse: [(resp) => `[processed] ${resp}`],
        },
      });

      const result = await agent.call("test");
      expect(result.text).toBe("[processed] raw response");
    });

    it("should chain multiple transform hooks", async () => {
      const agent = new BaseAgent({
        name: "test",
        model: createMockModel(["response"]),
        hooks: {
          alterCallMessage: [(msg) => `A:${msg}`, (msg) => `B:${msg}`],
        },
      });

      await agent.call("start");
      const history = agent.getHistory();
      expect(history[0]?.content).toBe("B:A:start");
    });

    it("should run beforeCall and afterCall side-effect hooks", async () => {
      const calls: string[] = [];

      const agent = new BaseAgent({
        name: "test",
        model: createMockModel(["response"]),
        hooks: {
          beforeCall: [
            () => {
              calls.push("before");
            },
          ],
          afterCall: [
            () => {
              calls.push("after");
            },
          ],
        },
      });

      await agent.call("test");
      expect(calls).toEqual(["before", "after"]);
    });

    it("should use initial hooks on first call", async () => {
      const calls: string[] = [];

      const agent = new BaseAgent({
        name: "test",
        model: createMockModel(["r1", "r2"]),
        hooks: {
          beforeInitialCall: [
            () => {
              calls.push("initial-before");
            },
          ],
          beforeCall: [
            () => {
              calls.push("regular-before");
            },
          ],
        },
      });

      await agent.call("first");
      expect(calls).toEqual(["initial-before"]);

      calls.length = 0;
      await agent.call("second");
      expect(calls).toEqual(["regular-before"]);
    });

    it("should fall back to base hooks when initial hooks are undefined", async () => {
      const calls: string[] = [];

      const agent = new BaseAgent({
        name: "test",
        model: createMockModel(["r1", "r2"]),
        hooks: {
          // No initial hooks defined — should fall back
          beforeCall: [
            () => {
              calls.push("base-before");
            },
          ],
        },
      });

      await agent.call("first");
      expect(calls).toEqual(["base-before"]);
    });
  });

  describe("reset", () => {
    it("should clear history", async () => {
      const agent = new BaseAgent({
        name: "test",
        model: createMockModel(["r1"]),
      });

      await agent.call("msg");
      expect(agent.getHistory()).toHaveLength(2);

      agent.reset();
      expect(agent.getHistory()).toHaveLength(0);
    });

    it("should reset first-call state", async () => {
      const calls: string[] = [];

      const agent = new BaseAgent({
        name: "test",
        model: createMockModel(["r1", "r2", "r3"]),
        hooks: {
          beforeInitialCall: [
            () => {
              calls.push("initial");
            },
          ],
          beforeCall: [
            () => {
              calls.push("regular");
            },
          ],
        },
      });

      await agent.call("first");
      expect(calls).toEqual(["initial"]);

      agent.reset();
      calls.length = 0;

      await agent.call("after-reset");
      expect(calls).toEqual(["initial"]);
    });
  });

  describe("getHistory", () => {
    it("should return a copy of history (not mutable reference)", async () => {
      const agent = new BaseAgent({
        name: "test",
        model: createMockModel(["r1"]),
      });

      await agent.call("msg");
      const history1 = agent.getHistory();
      const history2 = agent.getHistory();

      expect(history1).not.toBe(history2);
      expect(history1).toEqual(history2);
    });
  });

  describe("onStreamEvent hooks", () => {
    it("should fire onStreamEvent hooks during _callStream (config.stream: true)", async () => {
      const events: string[] = [];
      const agent = new BaseAgent({
        name: "test",
        model: createMockModel(["streamed response"]),
        stream: true,
        hooks: {
          onStreamEvent: [
            (event) => {
              events.push(event.type);
            },
          ],
        },
      });

      const result = await agent.call("test");
      expect(result.text).toBe("streamed response");

      // Should have at least a text event and a done event
      expect(events).toContain("text");
      expect(events).toContain("done");
    });

    it("should fire onStreamEvent hooks during stream() generator", async () => {
      const events: string[] = [];
      const agent = new BaseAgent({
        name: "test",
        model: createMockModel(["streamed output"]),
        hooks: {
          onStreamEvent: [
            (event) => {
              events.push(event.type);
            },
          ],
        },
      });

      const collected: import("./types").AgentStreamEvent[] = [];
      for await (const event of agent.stream("test")) {
        collected.push(event);
      }

      // Both yielded and hook events should match
      expect(collected.length).toBeGreaterThan(0);
      expect(collected[collected.length - 1].type).toBe("done");

      // Hook events should mirror the yielded events
      expect(events).toContain("text");
      expect(events).toContain("done");
      expect(events.length).toBe(collected.length);
    });

    it("should not break when no onStreamEvent hooks are registered (stream: true)", async () => {
      const agent = new BaseAgent({
        name: "test",
        model: createMockModel(["no hooks"]),
        stream: true,
      });

      const result = await agent.call("test");
      expect(result.text).toBe("no hooks");
    });

    it("should capture text content in onStreamEvent hooks", async () => {
      const texts: string[] = [];
      const agent = new BaseAgent({
        name: "test",
        model: createMockModel(["hello world"]),
        stream: true,
        hooks: {
          onStreamEvent: [
            (event) => {
              if (event.type === "text") {
                texts.push(event.text);
              }
            },
          ],
        },
      });

      await agent.call("test");
      expect(texts.join("")).toBe("hello world");
    });
  });
});
