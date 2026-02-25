// Tests for defineFlow / createFlow — the core flow API.

import { describe, expect, it, mock } from "bun:test";
import type { Agent, AgentCallResult } from "../agents/types";
import { FlowExecutionError } from "../errors/index";
import type { FlowHooks } from "../hooks/types";
import { buildFlowResult, createFlow, createFlowContext, defineFlow } from "./define-flow";
import type { FlowResult } from "./types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeAgent(name: string, response: string | ((msg: string) => string)): Agent {
  let firstCall = true;
  return {
    name,
    async call(message: string): Promise<AgentCallResult> {
      const text = typeof response === "function" ? response(message) : response;
      return {
        text,
        steps: [],
        usage: { promptTokens: 5, completionTokens: 10 },
        finishReason: "stop",
      };
    },
    reset(): void {
      firstCall = true;
    },
  };
}

function makeFailingAgent(name: string, error: Error): Agent {
  return {
    name,
    async call(_message: string): Promise<AgentCallResult> {
      throw error;
    },
    reset(): void {},
  };
}

// ---------------------------------------------------------------------------
// buildFlowResult
// ---------------------------------------------------------------------------

describe("buildFlowResult", () => {
  it("aggregates usage from step results", () => {
    const sr1: AgentCallResult = {
      text: "a",
      steps: [],
      usage: { promptTokens: 10, completionTokens: 20 },
      finishReason: "stop",
    };
    const sr2: AgentCallResult = {
      text: "b",
      steps: [],
      usage: { promptTokens: 5, completionTokens: 15 },
      finishReason: "stop",
    };

    const result = buildFlowResult("final", [sr1, sr2]);

    expect(result.text).toBe("final");
    expect(result.usage.promptTokens).toBe(15);
    expect(result.usage.completionTokens).toBe(35);
    expect(result.finishReason).toBe("stop");
    expect(result.stepResults).toEqual([sr1, sr2]);
  });

  it("handles empty step results", () => {
    const result = buildFlowResult("done", []);

    expect(result.text).toBe("done");
    expect(result.usage.promptTokens).toBe(0);
    expect(result.usage.completionTokens).toBe(0);
    expect(result.stepResults).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// createFlowContext
// ---------------------------------------------------------------------------

describe("createFlowContext", () => {
  it("tracks step results via runStep", async () => {
    const ctx = createFlowContext("test-flow");
    const agent = makeAgent("a", "hello");

    const result = await ctx.runStep(agent, "input");

    expect(result.text).toBe("hello");
    expect(ctx.results).toHaveLength(1);
    expect(ctx.results[0].text).toBe("hello");
  });

  it("accumulates multiple step results", async () => {
    const ctx = createFlowContext("test-flow");
    const a1 = makeAgent("a1", "first");
    const a2 = makeAgent("a2", "second");

    await ctx.runStep(a1, "msg");
    await ctx.runStep(a2, "msg");

    expect(ctx.results).toHaveLength(2);
    expect(ctx.results[0].text).toBe("first");
    expect(ctx.results[1].text).toBe("second");
  });

  it("wraps step errors in FlowExecutionError", async () => {
    const ctx = createFlowContext("test-flow");
    const agent = makeFailingAgent("bad", new Error("boom"));

    await expect(ctx.runStep(agent, "msg")).rejects.toThrow(FlowExecutionError);
    await expect(ctx.runStep(agent, "msg")).rejects.toThrow('Step "bad" failed: boom');
  });

  it("throws FlowExecutionError when already aborted", async () => {
    const controller = new AbortController();
    controller.abort();
    const ctx = createFlowContext("test-flow", controller.signal);
    const agent = makeAgent("a", "hello");

    await expect(ctx.runStep(agent, "msg")).rejects.toThrow(FlowExecutionError);
    await expect(ctx.runStep(agent, "msg")).rejects.toThrow("Flow was aborted");
  });

  it("exposes flow name and abort signal", () => {
    const controller = new AbortController();
    const ctx = createFlowContext("my-flow", controller.signal);

    expect(ctx.name).toBe("my-flow");
    expect(ctx.abort).toBe(controller.signal);
  });
});

// ---------------------------------------------------------------------------
// defineFlow
// ---------------------------------------------------------------------------

describe("defineFlow", () => {
  it("creates a reusable flow type factory", async () => {
    const createPipeline = defineFlow("pipeline", async (steps, message, ctx) => {
      let current = message;
      for (const step of steps) {
        const r = await ctx.runStep(step, current);
        current = r.text;
      }
      return current;
    });

    const flow = createPipeline({
      name: "my-pipe",
      steps: [makeAgent("a", (msg) => `A(${msg})`), makeAgent("b", (msg) => `B(${msg})`)],
    });

    expect(flow.name).toBe("my-pipe");

    const result = await flow.call("start");
    expect(result.text).toBe("B(A(start))");
  });

  it("returns FlowResult with stepResults", async () => {
    const createPipeline = defineFlow("pipeline", async (steps, message, ctx) => {
      let current = message;
      for (const step of steps) {
        const r = await ctx.runStep(step, current);
        current = r.text;
      }
      return current;
    });

    const flow = createPipeline({
      name: "pipe",
      steps: [makeAgent("a", "hello"), makeAgent("b", "world")],
    });

    const result = (await flow.call("start")) as FlowResult;
    expect(result.stepResults).toHaveLength(2);
    expect(result.stepResults[0].text).toBe("hello");
    expect(result.stepResults[1].text).toBe("world");
    expect(result.usage.promptTokens).toBe(10); // 5 + 5
    expect(result.usage.completionTokens).toBe(20); // 10 + 10
  });

  it("throws FlowExecutionError for empty steps", () => {
    const factory = defineFlow("test", async (_s, msg, _ctx) => msg);

    expect(() => factory({ name: "empty", steps: [] })).toThrow(FlowExecutionError);
    expect(() => factory({ name: "empty", steps: [] })).toThrow(
      "test flow requires at least one step",
    );
  });

  it("applies flow hooks", async () => {
    const order: string[] = [];
    const hooks: FlowHooks = {
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
    };

    const factory = defineFlow("test", async (steps, message, ctx) => {
      order.push("execute");
      const r = await ctx.runStep(steps[0], message);
      return r.text;
    });

    const flow = factory({
      name: "hooked",
      steps: [makeAgent("a", "response")],
      hooks,
    });

    await flow.call("input");

    expect(order).toEqual(["alter-before", "before", "execute", "after", "alter-after"]);
  });

  it("reset() resets all steps", () => {
    const resetCalls: string[] = [];
    const agent1: Agent = {
      name: "a1",
      async call() {
        return {
          text: "",
          steps: [],
          usage: { promptTokens: 0, completionTokens: 0 },
          finishReason: "stop",
        };
      },
      reset() {
        resetCalls.push("a1");
      },
    };
    const agent2: Agent = {
      name: "a2",
      async call() {
        return {
          text: "",
          steps: [],
          usage: { promptTokens: 0, completionTokens: 0 },
          finishReason: "stop",
        };
      },
      reset() {
        resetCalls.push("a2");
      },
    };

    const factory = defineFlow("test", async (_s, msg, _ctx) => msg);
    const flow = factory({ name: "f", steps: [agent1, agent2] });

    flow.reset();

    expect(resetCalls).toEqual(["a1", "a2"]);
  });
});

// ---------------------------------------------------------------------------
// createFlow
// ---------------------------------------------------------------------------

describe("createFlow", () => {
  it("creates a one-off custom flow", async () => {
    const flow = createFlow({
      name: "custom",
      steps: [makeAgent("a", "hello"), makeAgent("b", "world")],
      execute: async (steps, _message, ctx) => {
        // Only run the second step
        const r = await ctx.runStep(steps[1], "custom-input");
        return r.text;
      },
    });

    const result = await flow.call("ignored");
    expect(result.text).toBe("world");

    const flowResult = result as FlowResult;
    expect(flowResult.stepResults).toHaveLength(1);
    expect(flowResult.stepResults[0].text).toBe("world");
  });

  it("supports conditional step execution", async () => {
    const flow = createFlow({
      name: "conditional",
      steps: [
        makeAgent("check", (msg) => (msg.includes("skip") ? "SKIP" : "CONTINUE")),
        makeAgent("work", "done"),
      ],
      execute: async (steps, message, ctx) => {
        const check = await ctx.runStep(steps[0], message);
        if (check.text === "SKIP") return check.text;
        const work = await ctx.runStep(steps[1], check.text);
        return work.text;
      },
    });

    const skip = await flow.call("please skip this");
    expect(skip.text).toBe("SKIP");
    expect((skip as FlowResult).stepResults).toHaveLength(1);

    const proceed = await flow.call("go ahead");
    expect(proceed.text).toBe("done");
    expect((proceed as FlowResult).stepResults).toHaveLength(2);
  });

  it("throws FlowExecutionError for empty steps", () => {
    expect(() =>
      createFlow({
        name: "empty",
        steps: [],
        execute: async (_s, msg, _ctx) => msg,
      }),
    ).toThrow(FlowExecutionError);
  });

  it("propagates step errors as FlowExecutionError", async () => {
    const flow = createFlow({
      name: "failing",
      steps: [makeFailingAgent("bad", new Error("oops"))],
      execute: async (steps, message, ctx) => {
        const r = await ctx.runStep(steps[0], message);
        return r.text;
      },
    });

    await expect(flow.call("test")).rejects.toThrow(FlowExecutionError);
    await expect(flow.call("test")).rejects.toThrow('Step "bad" failed: oops');
  });
});

// ---------------------------------------------------------------------------
// Step hooks (beforeStep / afterStep)
// ---------------------------------------------------------------------------

describe("step hooks", () => {
  it("fires beforeStep and afterStep for each step via createFlowContext", async () => {
    const events: string[] = [];
    const hooks: FlowHooks = {
      beforeStep: [
        ({ stepName, message }) => {
          events.push(`before:${stepName}:${message}`);
        },
      ],
      afterStep: [
        ({ stepName, message, result }) => {
          events.push(`after:${stepName}:${message}:${result.text}`);
        },
      ],
    };

    const ctx = createFlowContext("test-flow", undefined, hooks);
    const a1 = makeAgent("agent-a", "hello");
    const a2 = makeAgent("agent-b", "world");

    await ctx.runStep(a1, "input1");
    await ctx.runStep(a2, "input2");

    expect(events).toEqual([
      "before:agent-a:input1",
      "after:agent-a:input1:hello",
      "before:agent-b:input2",
      "after:agent-b:input2:world",
    ]);
  });

  it("fires step hooks within defineFlow-based flows", async () => {
    const events: string[] = [];
    const hooks: FlowHooks = {
      beforeStep: [
        ({ stepName }) => {
          events.push(`before:${stepName}`);
        },
      ],
      afterStep: [
        ({ stepName, result }) => {
          events.push(`after:${stepName}:${result.text}`);
        },
      ],
    };

    const factory = defineFlow("pipeline", async (steps, message, ctx) => {
      let current = message;
      for (const step of steps) {
        const r = await ctx.runStep(step, current);
        current = r.text;
      }
      return current;
    });

    const flow = factory({
      name: "hooked-pipe",
      steps: [makeAgent("a", "first"), makeAgent("b", "second")],
      hooks,
    });

    await flow.call("start");

    expect(events).toEqual(["before:a", "after:a:first", "before:b", "after:b:second"]);
  });

  it("fires step hooks within createFlow-based flows", async () => {
    const events: string[] = [];
    const hooks: FlowHooks = {
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
    };

    const flow = createFlow({
      name: "custom-hooked",
      steps: [makeAgent("x", "output")],
      hooks,
      execute: async (steps, message, ctx) => {
        const r = await ctx.runStep(steps[0], message);
        return r.text;
      },
    });

    await flow.call("msg");

    expect(events).toEqual(["before:x:msg", "after:x:output"]);
  });

  it("step hooks fire alongside flow-level hooks in correct order", async () => {
    const order: string[] = [];
    const hooks: FlowHooks = {
      beforeFlow: [
        () => {
          order.push("flow-before");
        },
      ],
      afterFlow: [
        () => {
          order.push("flow-after");
        },
      ],
      beforeStep: [
        ({ stepName }) => {
          order.push(`step-before:${stepName}`);
        },
      ],
      afterStep: [
        ({ stepName }) => {
          order.push(`step-after:${stepName}`);
        },
      ],
    };

    const factory = defineFlow("test", async (steps, message, ctx) => {
      const r = await ctx.runStep(steps[0], message);
      return r.text;
    });

    const flow = factory({
      name: "ordered",
      steps: [makeAgent("a", "response")],
      hooks,
    });

    await flow.call("input");

    expect(order).toEqual(["flow-before", "step-before:a", "step-after:a", "flow-after"]);
  });

  it("afterStep does not fire if step throws", async () => {
    const events: string[] = [];
    const hooks: FlowHooks = {
      beforeStep: [
        () => {
          events.push("before");
        },
      ],
      afterStep: [
        () => {
          events.push("after");
        },
      ],
    };

    const ctx = createFlowContext("test-flow", undefined, hooks);
    const agent = makeFailingAgent("bad", new Error("boom"));

    await expect(ctx.runStep(agent, "msg")).rejects.toThrow(FlowExecutionError);

    // beforeStep fires, afterStep does not
    expect(events).toEqual(["before"]);
  });
});
