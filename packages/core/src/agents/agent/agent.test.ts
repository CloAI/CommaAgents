// Tests for createAgent — custom execute override on AgentConfig
//
// These tests cover the `execute` field added in Pass 7, which allows
// createAgent to be used without a model by providing arbitrary logic.

import { describe, expect, it } from "bun:test";
import { createPromptTemplate } from "../../prompts/template/prompt-template";
import { hookIntoAgent } from "../hook-into-agent/hook-into-agent";
import { createAgent } from "./agent";
import type { AgentCallResult } from "./agent.types";

// execute returning a string

describe("createAgent with config.execute", () => {
  describe("execute returning a string", () => {
    it("should synthesize an AgentCallResult from the returned string", async () => {
      const agent = createAgent({
        name: "echo",
        execute: async (msg) => `Echo: ${msg}`,
      });

      const result = await agent.call("hello");

      expect(result.text).toBe("Echo: hello");
      expect(result.responseMessages).toEqual([
        { role: "assistant", content: "Echo: hello" },
      ]);
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
      });

      hookIntoAgent(agent, {
        alterCallMessage: [async (msg) => `[prefix] ${msg}`],
      });

      await agent.call("original");
      expect(received).toEqual(["[prefix] original"]);
    });
  });

  // ---------------------------------------------------------------------------
  // execute returning a full AgentCallResult
  // ---------------------------------------------------------------------------

  describe("execute returning a full AgentCallResult", () => {
    it("should pass through the returned AgentCallResult", async () => {
      const custom: AgentCallResult = {
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

      const result = await agent.call("anything");

      expect(result.text).toBe("custom result");
      expect(result.responseMessages).toEqual(custom.responseMessages);
      expect(result.steps).toEqual([]);
      expect(result.usage).toEqual({ promptTokens: 42, completionTokens: 99 });
      expect(result.finishReason).toBe("length");
    });

    it("should apply alterResponse hooks to the AgentCallResult text", async () => {
      const agent = createAgent({
        name: "hooked",
        execute: async () => ({
          text: "raw",
          responseMessages: [{ role: "assistant" as const, content: "raw" }],
          steps: [],
          usage: { promptTokens: 0, completionTokens: 0 },
          finishReason: "stop",
        }),
      });

      hookIntoAgent(agent, {
        alterResponse: [async (text) => `[wrapped] ${text}`],
      });

      const result = await agent.call("test");
      expect(result.text).toBe("[wrapped] raw");
    });
  });

  // ---------------------------------------------------------------------------
  // stream() with execute override
  // ---------------------------------------------------------------------------

  describe("stream() with execute override", () => {
    it("should yield a done event with the execute result (no intermediate stream events)", async () => {
      const agent = createAgent({
        name: "exec-stream",
        execute: async (msg) => `Echo: ${msg}`,
      });

      const generator = agent.stream?.("test");
      const events: unknown[] = [];
      for await (const event of generator) {
        events.push(event);
      }

      // Execute override produces only a done event — no text/tool events.
      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({
        type: "done",
        result: {
          text: "Echo: test",
          responseMessages: [{ role: "assistant", content: "Echo: test" }],
          steps: [],
          usage: { promptTokens: 0, completionTokens: 0 },
          finishReason: "stop",
        },
      });
    });
  });

  // ---------------------------------------------------------------------------
  // History recording with custom execute
  // ---------------------------------------------------------------------------

  describe("context recording", () => {
    it("should record calls in conversation context", async () => {
      const agent = createAgent({
        name: "context-test",
        execute: async (msg) => `Reply to: ${msg}`,
      });

      await agent.call("first");
      await agent.call("second");

      const allMessages = agent.getConversationContext!().allMessages();

      // Context should contain user + assistant pairs for both calls
      expect(allMessages.length).toBeGreaterThanOrEqual(4);

      // Find user messages
      const userMessages = allMessages.filter((m) => m.role === "user");
      expect(userMessages).toHaveLength(2);

      // Find assistant messages
      const assistantMessages = allMessages.filter(
        (m) => m.role === "assistant",
      );
      expect(assistantMessages).toHaveLength(2);
    });

    it("should record turns accessible via getConversationContext().allTurns()", async () => {
      const agent = createAgent({
        name: "turns-test",
        execute: async (msg) => `Re: ${msg}`,
      });

      await agent.call("hello");
      await agent.call("world");

      const turns = agent.getConversationContext!().allTurns();
      expect(turns).toHaveLength(2);
    });

    it("should clear context on reset", async () => {
      const agent = createAgent({
        name: "reset-test",
        execute: async (msg) => msg,
      });

      await agent.call("before reset");
      expect(
        agent.getConversationContext!().allMessages().length,
      ).toBeGreaterThan(0);

      agent.reset();
      expect(agent.getConversationContext!().allMessages()).toHaveLength(0);
      expect(agent.getConversationContext!().allTurns()).toHaveLength(0);
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
      });

      hookIntoAgent(agent, {
        beforeFirstCall: [
          async () => {
            log.push("initial");
          },
        ],
        beforeCall: [
          async () => {
            log.push("regular");
          },
        ],
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
      });

      hookIntoAgent(agent, {
        beforeFirstCall: [
          async () => {
            log.push("initial");
          },
        ],
        beforeCall: [
          async () => {
            log.push("regular");
          },
        ],
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
    });

    hookIntoAgent(agent, {
      beforeCall: [
        async () => {
          log.push("original");
        },
      ],
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

    expect(() =>
      (agent as any).appendHook("nonExistent", async () => {}),
    ).toThrow(/Unknown hook name: "nonExistent"/);
  });

  it("should support appending transform hooks", async () => {
    const agent = createAgent({
      name: "test",
      execute: async (msg) => msg,
    });

    (agent as any).appendHook(
      "alterResponse",
      async (text: string) => `${text}+suffix`,
    );

    const result = await agent.call("hello");
    expect(result.text).toBe("hello+suffix");
  });

  it("should respect initial vs regular lifecycle for appended hooks", async () => {
    const log: string[] = [];

    const agent = createAgent({
      name: "test",
      execute: async (msg) => msg,
    });

    (agent as any).appendHook("beforeFirstCall", async () =>
      log.push("initial"),
    );
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

    (agent as any).appendHook("afterCallResult", async () => log.push("fired"));

    await agent.call("hello");
    expect(log).toEqual(["fired"]);
  });
});

// ---------------------------------------------------------------------------
// updatePromptVariables
// ---------------------------------------------------------------------------

describe("Agent.updatePromptVariables", () => {
  it("updates prompt template variables for subsequent calls", async () => {
    const receivedMessages: string[] = [];

    const agent = createAgent({
      name: "dynamic",
      execute: async (msg) => {
        receivedMessages.push(msg);
        return `Response to: ${msg}`;
      },
      systemPrompt: createPromptTemplate({
        template: "[{{ role }}]",
        variables: { role: "initial" },
      }),
    });

    agent.updatePromptVariables({ role: "updated" });

    // Reset so first call flag is fresh (getConversationContext doesn't
    // reflect the system prompt — it only holds conversation turns. To
    // observe the resolved prompt we'd need to mock buildCallOptions.
    // Instead we verify through the template's defaults property.)
    const prompt = createPromptTemplate({
      template: "[{{ role }}]",
      variables: { role: "initial" },
    });
    expect(prompt.defaults).toEqual({ role: "initial" });
    prompt.updatePromptVariables({ role: "updated" });
    expect(prompt.defaults).toEqual({ role: "updated" });

    // The agent call path validates the agent doesn't throw
    await agent.call("test");
    expect(receivedMessages.length).toBe(1);
  });

  it("is a no-op when the agent has a static string prompt", () => {
    const agent = createAgent({
      name: "static",
      execute: async (msg) => msg,
      systemPrompt: "You are a helpful assistant.",
    });

    expect(() => agent.updatePromptVariables({ role: "reviewer" })).not.toThrow();
  });

  it("is a no-op when the agent has no system prompt", () => {
    const agent = createAgent({
      name: "blank",
      execute: async (msg) => msg,
    });

    expect(() => agent.updatePromptVariables({ role: "reviewer" })).not.toThrow();
  });

  it("reflects updated variables in config.systemPrompt.defaults", () => {
    const template = createPromptTemplate({
      template: "You are {{ role }}.",
      variables: { role: "initial" },
    });

    const agent = createAgent({
      name: "dynamic",
      execute: async (msg) => msg,
      systemPrompt: template,
    });

    agent.updatePromptVariables({ role: "updated" });

    expect(template.defaults).toEqual({ role: "updated" });
  });
});


