// Tests for hookIntoFlow (flows/hook-into-flow.ts)

import { describe, expect, it } from "bun:test";
import type { Agent, AgentCallResult } from "../../agents/agent/agent.types";
import { createBroadcastFlow } from "../built-in/broadcast/broadcast-flow";
import { createCycleFlow } from "../built-in/cycle/cycle-flow";
import { createSequentialFlow } from "../built-in/sequential/sequential-flow";
import { createFlow } from "../flow/flow";
import type { CycleHooks } from "../flow/flow.types";
import { makeAgent } from "../test.utils";
import { hookIntoFlow } from "./hook-into-flow";

// Mutation semantics

describe("hookIntoFlow", () => {
  describe("mutation semantics", () => {
    it("should return the same flow reference", () => {
      const flow = createSequentialFlow({
        name: "pipe",
        steps: [makeAgent("a", "hello")],
      });
      const result = hookIntoFlow(flow, {
        beforeFlow: [async () => {}],
      });
      expect(result).toBe(flow);
    });

    it("should throw for agents without appendHook", () => {
      const fake: Agent = {
        name: "fake",
        async call(): Promise<AgentCallResult> {
          return {
            text: "",
            usage: { promptTokens: 0, completionTokens: 0 },
            finishReason: "stop",
          };
        },
        reset(): void {},
      };

      expect(() => hookIntoFlow(fake, { beforeFlow: [async () => {}] })).toThrow(
        /does not support appendHook/,
      );
    });

    it("should include the agent name in the error message", () => {
      const fake: Agent = {
        name: "my-agent",
        async call(): Promise<AgentCallResult> {
          return {
            text: "",
            usage: { promptTokens: 0, completionTokens: 0 },
            finishReason: "stop",
          };
        },
        reset(): void {},
      };

      expect(() => hookIntoFlow(fake, {})).toThrow('"my-agent"');
    });
  });

  // ---------------------------------------------------------------------------
  // Flow-level hooks
  // ---------------------------------------------------------------------------

  describe("flow-level hooks", () => {
    it("should fire beforeFlow and afterFlow hooks", async () => {
      const log: string[] = [];

      const flow = createSequentialFlow({
        name: "pipe",
        steps: [makeAgent("a", "hello")],
      });

      hookIntoFlow(flow, {
        beforeFlow: [
          async () => {
            log.push("before");
          },
        ],
        afterFlow: [
          async () => {
            log.push("after");
          },
        ],
      });

      await flow.call("input");

      expect(log).toEqual(["before", "after"]);
    });

    it("should fire alterMessageBeforeFlow and alterMessageAfterFlow hooks", async () => {
      const flow = createSequentialFlow({
        name: "pipe",
        steps: [makeAgent("a", (msg) => `echo:${msg}`)],
      });

      hookIntoFlow(flow, {
        alterMessageBeforeFlow: [async (msg) => `[pre]${msg}`],
        alterMessageAfterFlow: [async (msg) => `${msg}[post]`],
      });

      const result = await flow.call("input");
      expect(result.text).toBe("echo:[pre]input[post]");
    });

    it("should fire all flow-level hooks in correct order", async () => {
      const order: string[] = [];

      const flow = createSequentialFlow({
        name: "pipe",
        steps: [
          makeAgent("a", () => {
            order.push("execute");
            return "done";
          }),
        ],
      });

      hookIntoFlow(flow, {
        alterMessageBeforeFlow: [
          async (msg) => {
            order.push("alter-before");
            return msg;
          },
        ],
        beforeFlow: [
          async () => {
            order.push("before");
          },
        ],
        afterFlow: [
          async () => {
            order.push("after");
          },
        ],
        alterMessageAfterFlow: [
          async (msg) => {
            order.push("alter-after");
            return msg;
          },
        ],
      });

      await flow.call("input");

      expect(order).toEqual(["alter-before", "before", "execute", "after", "alter-after"]);
    });
  });

  // ---------------------------------------------------------------------------
  // Step-level hooks
  // ---------------------------------------------------------------------------

  describe("step-level hooks", () => {
    it("should fire beforeStep and afterStep hooks", async () => {
      const events: string[] = [];

      const flow = createSequentialFlow({
        name: "pipe",
        steps: [makeAgent("agent-a", "hello"), makeAgent("agent-b", "world")],
      });

      hookIntoFlow(flow, {
        beforeStep: [
          ({ stepName, message }) => {
            events.push(`before:${stepName}:${message}`);
          },
        ],
        afterStep: [
          ({ stepName, result }) => {
            events.push(`after:${stepName}:${result.text}`);
          },
        ],
      });

      await flow.call("input");

      expect(events).toEqual([
        "before:agent-a:input",
        "after:agent-a:hello",
        "before:agent-b:hello",
        "after:agent-b:world",
      ]);
    });
  });

  // ---------------------------------------------------------------------------
  // Cycle-specific hooks via generic
  // ---------------------------------------------------------------------------

  describe("cycle-specific hooks", () => {
    it("should support alterMessageBeforeCycle via hookIntoFlow<CycleHooks>", async () => {
      const flow = createCycleFlow({
        name: "loop",
        steps: [makeAgent("a", (msg) => `processed:${msg}`)],
        cycles: 2,
      });

      hookIntoFlow<CycleHooks>(flow, {
        alterMessageBeforeCycle: [async (msg) => `[cycle-pre]${msg}`],
      });

      const result = await flow.call("start");
      // Cycle 1: alterBeforeCycle("[cycle-pre]start") -> step("processed:[cycle-pre]start")
      // Cycle 2: alterBeforeCycle("[cycle-pre]processed:[cycle-pre]start") -> step("processed:[cycle-pre]processed:[cycle-pre]start")
      expect(result.text).toBe("processed:[cycle-pre]processed:[cycle-pre]start");
    });

    it("should support alterMessageAfterCycle via hookIntoFlow<CycleHooks>", async () => {
      const flow = createCycleFlow({
        name: "loop",
        steps: [makeAgent("a", (msg) => `step:${msg}`)],
        cycles: 2,
      });

      hookIntoFlow<CycleHooks>(flow, {
        alterMessageAfterCycle: [async (msg) => `${msg}[cycle-post]`],
      });

      const result = await flow.call("start");
      // Cycle 1: step("step:start") -> afterCycle("step:start[cycle-post]")
      // Cycle 2: step("step:step:start[cycle-post]") -> afterCycle("step:step:start[cycle-post][cycle-post]")
      expect(result.text).toBe("step:step:start[cycle-post][cycle-post]");
    });
  });

  // ---------------------------------------------------------------------------
  // Accumulation
  // ---------------------------------------------------------------------------

  describe("accumulation", () => {
    it("should accumulate hooks from multiple hookIntoFlow calls", async () => {
      const log: string[] = [];

      const flow = createSequentialFlow({
        name: "pipe",
        steps: [makeAgent("a", "hello")],
      });

      hookIntoFlow(flow, {
        beforeFlow: [
          async () => {
            log.push("hook-1");
          },
        ],
      });
      hookIntoFlow(flow, {
        beforeFlow: [
          async () => {
            log.push("hook-2");
          },
        ],
      });

      await flow.call("test");
      expect(log).toEqual(["hook-1", "hook-2"]);
    });

    it("should append to hooks from config, not replace them", async () => {
      const log: string[] = [];

      const flow = createSequentialFlow({
        name: "pipe",
        steps: [makeAgent("a", "hello")],
        hooks: {
          beforeFlow: [
            async () => {
              log.push("config-hook");
            },
          ],
        },
      });

      hookIntoFlow(flow, {
        beforeFlow: [
          async () => {
            log.push("appended-hook");
          },
        ],
      });

      await flow.call("test");
      expect(log).toEqual(["config-hook", "appended-hook"]);
    });
  });

  // ---------------------------------------------------------------------------
  // Chaining
  // ---------------------------------------------------------------------------

  describe("chaining", () => {
    it("should support chaining hookIntoFlow calls", async () => {
      const log: string[] = [];

      const flow = hookIntoFlow(
        hookIntoFlow(
          createSequentialFlow({
            name: "pipe",
            steps: [makeAgent("a", "hello")],
          }),
          {
            beforeFlow: [
              async () => {
                log.push("first");
              },
            ],
          },
        ),
        {
          beforeFlow: [
            async () => {
              log.push("second");
            },
          ],
        },
      );

      await flow.call("test");
      expect(log).toEqual(["first", "second"]);
    });
  });

  // ---------------------------------------------------------------------------
  // Empty hooks
  // ---------------------------------------------------------------------------

  describe("empty hooks", () => {
    it("should be a no-op when given empty hooks", async () => {
      const flow = createSequentialFlow({
        name: "pipe",
        steps: [makeAgent("a", (msg) => msg)],
      });

      hookIntoFlow(flow, {});

      const result = await flow.call("hello");
      expect(result.text).toBe("hello");
    });
  });

  // ---------------------------------------------------------------------------
  // Works with all flow types
  // ---------------------------------------------------------------------------

  describe("works with all flow types", () => {
    it("should work with createFlow (custom flow)", async () => {
      const log: string[] = [];

      const flow = createFlow({
        name: "custom",
        steps: [makeAgent("a", "result")],
        execute: async (steps, message, ctx) => {
          const r = await ctx.runStep(steps[0]!, message);
          return r.text;
        },
      });

      hookIntoFlow(flow, {
        beforeFlow: [
          async () => {
            log.push("before");
          },
        ],
        afterFlow: [
          async () => {
            log.push("after");
          },
        ],
      });

      await flow.call("test");
      expect(log).toEqual(["before", "after"]);
    });

    it("should work with createBroadcastFlow", async () => {
      const log: string[] = [];

      const flow = createBroadcastFlow({
        name: "broadcast",
        steps: [makeAgent("a", "one"), makeAgent("b", "two")],
      });

      hookIntoFlow(flow, {
        beforeFlow: [
          async () => {
            log.push("before");
          },
        ],
        afterFlow: [
          async () => {
            log.push("after");
          },
        ],
      });

      const result = await flow.call("test");
      expect(log).toEqual(["before", "after"]);
      expect(result.text).toBe("one\n\ntwo");
    });

    it("should work with createCycleFlow", async () => {
      const log: string[] = [];

      const flow = createCycleFlow({
        name: "cycle",
        steps: [makeAgent("a", (msg) => `${msg}+`)],
        cycles: 2,
      });

      hookIntoFlow(flow, {
        beforeFlow: [
          async () => {
            log.push("before");
          },
        ],
        afterFlow: [
          async () => {
            log.push("after");
          },
        ],
      });

      const result = await flow.call("start");
      expect(log).toEqual(["before", "after"]);
      expect(result.text).toBe("start++");
    });
  });

  // ---------------------------------------------------------------------------
  // Hooks take effect on subsequent calls
  // ---------------------------------------------------------------------------

  describe("hooks take effect on subsequent calls", () => {
    it("should apply hooks added after first call to subsequent calls", async () => {
      const log: string[] = [];

      const flow = createSequentialFlow({
        name: "pipe",
        steps: [makeAgent("a", "hello")],
      });

      // First call — no extra hooks
      await flow.call("test");
      expect(log).toEqual([]);

      // Append hook after first call
      hookIntoFlow(flow, {
        beforeFlow: [
          async () => {
            log.push("added-later");
          },
        ],
      });

      // Second call — hook should fire
      await flow.call("test");
      expect(log).toEqual(["added-later"]);
    });
  });
});
