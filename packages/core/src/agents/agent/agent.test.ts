// Tests for createAgent — custom execute override on AgentConfig
//
// These tests cover the `execute` field added in Pass 7, which allows
// createAgent to be used without a model by providing arbitrary logic.

import { describe, expect, it } from "bun:test";
import { createAgent } from "./agent";
import type { LLMCallResult } from "./agent.types";

// execute returning a string

describe("createAgent with config.execute", () => {
  describe("execute returning a string", () => {
    it("should synthesize an LLMCallResult from the returned string", async () => {
      const agent = createAgent({
        name: "echo",
        execute: async (msg) => `Echo: ${msg}`,
      });

      const result = (await agent.call("hello")) as LLMCallResult;

      expect(result.text).toBe("Echo: hello");
      expect(result.responseMessages).toEqual([{ role: "assistant", content: "Echo: hello" }]);
      expect(result.steps).toEqual([]);
      expect(result.usage).toEqual({ promptTokens: 0, completionTokens: 0 });
      expect(result.finishReason).toBe("stop");
    });

    it("should pass the hook-altered message to execute", async () => {
      const received: string[] = [];

      const agent = createAgent({
        name: "spy",
        execute: async (msg) => {
          received.push(msg);
          return msg;
        },
        hooks: {
          alterCallMessage: [async (msg) => `[prefix] ${msg}`],
        },
      });

      await agent.call("original");
      expect(received).toEqual(["[prefix] original"]);
    });
  });

  // ---------------------------------------------------------------------------
  // execute returning a full LLMCallResult
  // ---------------------------------------------------------------------------

  describe("execute returning a full LLMCallResult", () => {
    it("should pass through the returned LLMCallResult", async () => {
      const custom: LLMCallResult = {
        text: "custom result",
        responseMessages: [{ role: "assistant", content: "custom result" }],
        steps: [],
        usage: { promptTokens: 42, completionTokens: 99 },
        finishReason: "length",
      };

      const agent = createAgent({
        name: "custom",
        execute: async () => custom,
      });

      const result = (await agent.call("anything")) as LLMCallResult;

      expect(result.text).toBe("custom result");
      expect(result.responseMessages).toEqual(custom.responseMessages);
      expect(result.steps).toEqual([]);
      expect(result.usage).toEqual({ promptTokens: 42, completionTokens: 99 });
      expect(result.finishReason).toBe("length");
    });

    it("should apply alterResponse hooks to the LLMCallResult text", async () => {
      const agent = createAgent({
        name: "hooked",
        execute: async () => ({
          text: "raw",
          responseMessages: [{ role: "assistant" as const, content: "raw" }],
          steps: [],
          usage: { promptTokens: 0, completionTokens: 0 },
          finishReason: "stop",
        }),
        hooks: {
          alterResponse: [async (text) => `[wrapped] ${text}`],
        },
      });

      const result = await agent.call("test");
      expect(result.text).toBe("[wrapped] raw");
    });
  });

  // ---------------------------------------------------------------------------
  // stream() throws when execute is set
  // ---------------------------------------------------------------------------

  describe("stream() with execute override", () => {
    it("should throw when stream() is called on an agent with execute", async () => {
      const agent = createAgent({
        name: "no-stream",
        execute: async (msg) => msg,
      });

      const generator = agent.stream!("test");

      await expect(generator.next()).rejects.toThrow(
        'Agent "no-stream" uses a custom execute override and does not support streaming.',
      );
    });
  });

  // ---------------------------------------------------------------------------
  // History recording with custom execute
  // ---------------------------------------------------------------------------

  describe("history recording", () => {
    it("should record calls in conversation history", async () => {
      const agent = createAgent({
        name: "history-test",
        execute: async (msg) => `Reply to: ${msg}`,
      });

      await agent.call("first");
      await agent.call("second");

      const history = agent.getHistory!();

      // History should contain user + assistant pairs for both calls
      expect(history.length).toBeGreaterThanOrEqual(4);

      // Find user messages
      const userMessages = history.filter((m) => m.role === "user");
      expect(userMessages).toHaveLength(2);

      // Find assistant messages
      const assistantMessages = history.filter((m) => m.role === "assistant");
      expect(assistantMessages).toHaveLength(2);
    });

    it("should record turns accessible via getTurns()", async () => {
      const agent = createAgent({
        name: "turns-test",
        execute: async (msg) => `Re: ${msg}`,
      });

      await agent.call("hello");
      await agent.call("world");

      const turns = agent.getTurns!();
      expect(turns).toHaveLength(2);
    });

    it("should clear history on reset", async () => {
      const agent = createAgent({
        name: "reset-test",
        execute: async (msg) => msg,
      });

      await agent.call("before reset");
      expect(agent.getHistory!().length).toBeGreaterThan(0);

      agent.reset();
      expect(agent.getHistory!()).toHaveLength(0);
      expect(agent.getTurns!()).toHaveLength(0);
    });
  });

  // ---------------------------------------------------------------------------
  // first-call flag with execute override
  // ---------------------------------------------------------------------------

  describe("first-call flag", () => {
    it("should use initial hooks on first call and regular hooks after", async () => {
      const log: string[] = [];

      const agent = createAgent({
        name: "first-call",
        execute: async (msg) => msg,
        hooks: {
          beforeInitialCall: [
            async () => {
              log.push("initial");
            },
          ],
          beforeCall: [
            async () => {
              log.push("regular");
            },
          ],
        },
      });

      await agent.call("first");
      await agent.call("second");

      expect(log).toEqual(["initial", "regular"]);
    });

    it("should reset first-call flag on reset()", async () => {
      const log: string[] = [];

      const agent = createAgent({
        name: "reset-first",
        execute: async (msg) => msg,
        hooks: {
          beforeInitialCall: [
            async () => {
              log.push("initial");
            },
          ],
          beforeCall: [
            async () => {
              log.push("regular");
            },
          ],
        },
      });

      await agent.call("first");
      expect(log).toEqual(["initial"]);

      agent.reset();
      log.length = 0;

      await agent.call("after-reset");
      expect(log).toEqual(["initial"]);
    });
  });
});

// appendHook — dynamic hook appending

describe("createAgent appendHook", () => {
  it("should add a hook that fires on the next call", async () => {
    const log: string[] = [];

    const agent = createAgent({
      name: "test",
      execute: async (msg) => msg,
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- appendHook is implementation-only
    (agent as any).appendHook("beforeCall", async () => log.push("appended"));

    await agent.call("hello");
    expect(log).toEqual(["appended"]);
  });

  it("should append to existing hooks, not replace them", async () => {
    const log: string[] = [];

    const agent = createAgent({
      name: "test",
      execute: async (msg) => msg,
      hooks: {
        beforeCall: [
          async () => {
            log.push("original");
          },
        ],
      },
    });

    (agent as any).appendHook("beforeCall", async () => log.push("appended"));

    await agent.call("hello");
    expect(log).toEqual(["original", "appended"]);
  });

  it("should throw for unknown hook names", () => {
    const agent = createAgent({
      name: "test",
      execute: async (msg) => msg,
    });

    expect(() => (agent as any).appendHook("nonExistent", async () => {})).toThrow(
      /Unknown hook name: "nonExistent"/,
    );
  });

  it("should support appending transform hooks", async () => {
    const agent = createAgent({
      name: "test",
      execute: async (msg) => msg,
    });

    (agent as any).appendHook("alterResponse", async (text: string) => `${text}+suffix`);

    const result = await agent.call("hello");
    expect(result.text).toBe("hello+suffix");
  });

  it("should respect initial vs regular lifecycle for appended hooks", async () => {
    const log: string[] = [];

    const agent = createAgent({
      name: "test",
      execute: async (msg) => msg,
    });

    (agent as any).appendHook("beforeInitialCall", async () => log.push("initial"));
    (agent as any).appendHook("beforeCall", async () => log.push("regular"));

    await agent.call("first");
    await agent.call("second");

    expect(log).toEqual(["initial", "regular"]);
  });

  it("should create the hook array when appending to an unset hook", async () => {
    const log: string[] = [];

    const agent = createAgent({
      name: "test",
      execute: async (msg) => msg,
      // No hooks at all in config
    });

    (agent as any).appendHook("afterCall", async () => log.push("fired"));

    await agent.call("hello");
    expect(log).toEqual(["fired"]);
  });
});
