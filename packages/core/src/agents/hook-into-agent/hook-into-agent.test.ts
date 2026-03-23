// Tests for hookIntoAgent (agents/hook-into-agent.ts)

import { describe, expect, it } from "bun:test";
import { createAgent } from "../agent/agent";
import type { Agent } from "../agent/agent.types";
import { hookIntoAgent } from "./hook-into-agent";

// Helpers

/** Create an agent with a custom execute override (no LLM needed). */
function makeAgent(name = "test", fn?: (msg: string) => string): Agent {
  return createAgent({
    name,
    execute: async (msg) => fn?.(msg) ?? `echo:${msg}`,
  });
}

// hookIntoAgent

describe("hookIntoAgent", () => {
  describe("mutation semantics", () => {
    it("should return the same agent reference", () => {
      const agent = makeAgent();
      const result = hookIntoAgent(agent, {
        beforeCall: [async () => {}],
      });
      expect(result).toBe(agent);
    });

    it("should throw for agents without appendHook", () => {
      // A plain object that satisfies Agent but not createAgent's concrete type
      const fake = {
        name: "fake",
        call: async () => ({
          text: "",
          usage: { promptTokens: 0, completionTokens: 0 },
          finishReason: "stop",
        }),
        stream: async function* () {},
        getHistory: () => [],
        getTurns: () => [],
        config: {} as any,
        reset: () => {},
      } as Agent;

      expect(() => hookIntoAgent(fake, { beforeCall: [async () => {}] })).toThrow(
        /does not support appendHook/,
      );
    });
  });

  describe("hook lifecycle", () => {
    it("should run appended hooks around the agent call", async () => {
      const log: string[] = [];

      const agent = makeAgent("test", (msg) => `result:${msg}`);

      hookIntoAgent(agent, {
        alterCallMessage: [
          async (msg) => {
            log.push(`alter-msg:${msg}`);
            return `altered:${msg}`;
          },
        ],
        beforeCall: [
          async (msg) => {
            log.push(`before:${msg}`);
          },
        ],
        afterCall: [
          async (text) => {
            log.push(`after:${text}`);
          },
        ],
        alterResponse: [
          async (text) => {
            log.push(`alter-resp:${text}`);
            return `wrapped:${text}`;
          },
        ],
      });

      const result = await agent.call("input");

      expect(log).toEqual([
        "alter-msg:input",
        "before:altered:input",
        "after:result:altered:input",
        "alter-resp:result:altered:input",
      ]);
      expect(result.text).toBe("wrapped:result:altered:input");
    });

    it("should run initial hooks on first call and regular hooks on subsequent calls", async () => {
      const log: string[] = [];

      const agent = makeAgent();

      hookIntoAgent(agent, {
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
      });

      await agent.call("first");
      await agent.call("second");

      expect(log).toEqual(["initial", "regular"]);
    });
  });

  describe("alter response", () => {
    it("should apply alter-response hooks to the result text", async () => {
      const agent = makeAgent("test", () => "raw");

      hookIntoAgent(agent, {
        alterResponse: [async (text) => `${text}+modified`],
      });

      const result = await agent.call("test");
      expect(result.text).toBe("raw+modified");
    });
  });

  describe("alter message", () => {
    it("should alter the message before the execute", async () => {
      const received: string[] = [];

      const agent = createAgent({
        name: "test",
        execute: async (msg) => {
          received.push(msg);
          return `got:${msg}`;
        },
      });

      hookIntoAgent(agent, {
        alterCallMessage: [async (msg) => `[prefix]${msg}`],
      });

      await agent.call("hello");
      expect(received).toEqual(["[prefix]hello"]);
    });
  });

  describe("accumulation", () => {
    it("should accumulate hooks from multiple hookIntoAgent calls", async () => {
      const log: string[] = [];

      const agent = makeAgent();

      hookIntoAgent(agent, {
        beforeCall: [
          async () => {
            log.push("hook-1");
          },
        ],
      });
      hookIntoAgent(agent, {
        beforeCall: [
          async () => {
            log.push("hook-2");
          },
        ],
      });

      await agent.call("test");
      expect(log).toEqual(["hook-1", "hook-2"]);
    });

    it("should append to hooks from config, not replace them", async () => {
      const log: string[] = [];

      const agent = createAgent({
        name: "test",
        execute: async (msg) => msg,
        hooks: {
          beforeCall: [
            async () => {
              log.push("config-hook");
            },
          ],
        },
      });

      hookIntoAgent(agent, {
        beforeCall: [
          async () => {
            log.push("appended-hook");
          },
        ],
      });

      await agent.call("test");
      expect(log).toEqual(["config-hook", "appended-hook"]);
    });
  });

  describe("reset", () => {
    it("should reset first-call flag so initial hooks fire again", async () => {
      const log: string[] = [];

      const agent = makeAgent();

      hookIntoAgent(agent, {
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
      });

      // First call triggers initial
      await agent.call("first");
      expect(log).toEqual(["initial"]);

      // Second call triggers regular
      await agent.call("second");
      expect(log).toEqual(["initial", "regular"]);

      // Reset
      agent.reset();
      log.length = 0;

      // After reset, first call should trigger initial again
      await agent.call("after-reset");
      expect(log).toEqual(["initial"]);
    });
  });

  describe("chaining", () => {
    it("should support chaining hookIntoAgent calls", async () => {
      const log: string[] = [];

      const agent = hookIntoAgent(
        hookIntoAgent(makeAgent(), {
          beforeCall: [
            async () => {
              log.push("first");
            },
          ],
        }),
        {
          beforeCall: [
            async () => {
              log.push("second");
            },
          ],
        },
      );

      await agent.call("test");
      expect(log).toEqual(["first", "second"]);
    });
  });

  describe("empty hooks", () => {
    it("should be a no-op when given empty hooks", async () => {
      const agent = makeAgent("test", (msg) => msg);

      hookIntoAgent(agent, {});

      const result = await agent.call("hello");
      expect(result.text).toBe("hello");
    });
  });

  describe("tool hooks", () => {
    it("should accept beforeToolCall without throwing", () => {
      const agent = makeAgent();
      expect(() =>
        hookIntoAgent(agent, {
          beforeToolCall: [async (_ctx) => {}],
        }),
      ).not.toThrow();
    });

    it("should accept afterToolCall without throwing", () => {
      const agent = makeAgent();
      expect(() =>
        hookIntoAgent(agent, {
          afterToolCall: [async (_ctx) => {}],
        }),
      ).not.toThrow();
    });

    it("should accept both agent hooks and tool hooks together", () => {
      const agent = makeAgent();
      expect(() =>
        hookIntoAgent(agent, {
          beforeCall: [async () => {}],
          afterCall: [async () => {}],
          beforeToolCall: [async () => {}],
          afterToolCall: [async () => {}],
        }),
      ).not.toThrow();
    });

    it("should accumulate tool hooks from multiple hookIntoAgent calls", () => {
      const agent = makeAgent();
      // First injection
      hookIntoAgent(agent, {
        beforeToolCall: [async () => {}],
      });
      // Second injection should not throw (appends, doesn't replace)
      expect(() =>
        hookIntoAgent(agent, {
          beforeToolCall: [async () => {}],
        }),
      ).not.toThrow();
    });

    it("should append tool hooks alongside config tool hooks", () => {
      const agent = createAgent({
        name: "test",
        execute: async (msg) => msg,
        toolHooks: {
          beforeToolCall: [
            async () => {
              /* config hook */
            },
          ],
        },
      });

      // This should not throw — beforeToolCall is a valid hook name
      expect(() =>
        hookIntoAgent(agent, {
          beforeToolCall: [
            async () => {
              /* appended hook */
            },
          ],
        }),
      ).not.toThrow();
    });
  });
});
