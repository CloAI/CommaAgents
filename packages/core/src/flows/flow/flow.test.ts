// Tests for buildFlowAgent / createFlow — the core flow API.

import { describe, expect, it } from "bun:test";
import type { Agent, AgentCallResult } from "../../agents/agent/agent.types";
import { FlowExecutionError } from "../../errors/index";
import { hookIntoFlow } from "../hook-into-flow/hook-into-flow";
import { makeAgent, makeFailingAgent } from "../test.utils";
import { buildFlowAgent, createFlow } from "./flow";
import type { FlowConfig, FlowResult } from "./flow.types";
import { buildFlowResult } from "./flow.utils";

// buildFlowResult

describe("buildFlowResult", () => {
  it("aggregates usage from step results", () => {
    const sr1: AgentCallResult = {
      text: "a",
      usage: { promptTokens: 10, completionTokens: 20 },
      finishReason: "stop",
    };
    const sr2: AgentCallResult = {
      text: "b",
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

// buildFlowAgent

describe("buildFlowAgent", () => {
  it("creates an Agent from config + executor", async () => {
    const config: FlowConfig = {
      name: "my-pipe",
      steps: [makeAgent("a", (msg) => `A(${msg})`), makeAgent("b", (msg) => `B(${msg})`)],
    };
    const flow = buildFlowAgent(config, "pipeline", {}, async (steps, message, ctx) => {
      let current = message;
      for (const step of steps) {
        const r = await ctx.runStep(step, current);
        current = r.text;
      }
      return current;
    });

    expect(flow.name).toBe("my-pipe");

    const result = await flow.call("start");
    expect(result.text).toBe("B(A(start))");
  });

  it("returns FlowResult with stepResults", async () => {
    const config: FlowConfig = {
      name: "pipe",
      steps: [makeAgent("a", "hello"), makeAgent("b", "world")],
    };
    const flow = buildFlowAgent(config, "pipeline", {}, async (steps, message, ctx) => {
      let current = message;
      for (const step of steps) {
        const r = await ctx.runStep(step, current);
        current = r.text;
      }
      return current;
    });

    const result = (await flow.call("start")) as FlowResult;
    expect(result.stepResults).toHaveLength(2);
    expect(result.stepResults[0]?.text).toBe("hello");
    expect(result.stepResults[1]?.text).toBe("world");
    expect(result.usage.promptTokens).toBe(2); // 1 + 1
    expect(result.usage.completionTokens).toBe(4); // 2 + 2
  });

  it("throws FlowExecutionError for empty steps", () => {
    expect(() =>
      buildFlowAgent({ name: "empty", steps: [] }, "test", {}, async (_s, msg, _ctx) => msg),
    ).toThrow(FlowExecutionError);
    expect(() =>
      buildFlowAgent({ name: "empty", steps: [] }, "test", {}, async (_s, msg, _ctx) => msg),
    ).toThrow("test flow requires at least one step");
  });

  it("applies flow hooks via hookIntoFlow", async () => {
    const order: string[] = [];

    const config: FlowConfig = {
      name: "hooked",
      steps: [makeAgent("a", "response")],
    };

    const flow = buildFlowAgent(config, "test", {}, async (steps, message, ctx) => {
      order.push("execute");
      const r = await ctx.runStep(steps[0]!, message);
      return r.text;
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

  it("reset() resets all steps", () => {
    const resetCalls: string[] = [];
    const agent1: Agent = {
      name: "a1",
      async call() {
        return {
          text: "",
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
          usage: { promptTokens: 0, completionTokens: 0 },
          finishReason: "stop",
        };
      },
      reset() {
        resetCalls.push("a2");
      },
    };

    const config: FlowConfig = { name: "f", steps: [agent1, agent2] };
    const flow = buildFlowAgent(config, "test", {}, async (_s, msg, _ctx) => msg);

    flow.reset();

    expect(resetCalls).toEqual(["a1", "a2"]);
  });

  it("reset() calls onReset after step resets", () => {
    const order: string[] = [];
    const step: Agent = {
      name: "s",
      async call() {
        return {
          text: "",
          usage: { promptTokens: 0, completionTokens: 0 },
          finishReason: "stop",
        };
      },
      reset() {
        order.push("step-reset");
      },
    };

    const config: FlowConfig = { name: "f", steps: [step] };
    const flow = buildFlowAgent(
      config,
      "test",
      {},
      async (_s, msg, _ctx) => msg,
      () => order.push("onReset"),
    );

    flow.reset();

    expect(order).toEqual(["step-reset", "onReset"]);
  });

  it("wraps step errors in FlowExecutionError", async () => {
    const config: FlowConfig = { name: "f", steps: [makeFailingAgent("bad", new Error("boom"))] };
    const flow = buildFlowAgent(config, "test", {}, async (steps, msg, ctx) => {
      const r = await ctx.runStep(steps[0]!, msg);
      return r.text;
    });

    await expect(flow.call("msg")).rejects.toThrow(FlowExecutionError);
    await expect(flow.call("msg")).rejects.toThrow('Step "bad" failed: boom');
  });
});

// createFlow

describe("createFlow", () => {
  it("creates a one-off custom flow", async () => {
    const flow = createFlow({
      name: "custom",
      steps: [makeAgent("a", "hello"), makeAgent("b", "world")],
      execute: async (steps, _message, ctx) => {
        // Only run the second step
        const r = await ctx.runStep(steps[1]!, "custom-input");
        return r.text;
      },
    });

    const result = await flow.call("ignored");
    expect(result.text).toBe("world");

    const flowResult = result as FlowResult;
    expect(flowResult.stepResults).toHaveLength(1);
    expect(flowResult.stepResults[0]?.text).toBe("world");
  });

  it("supports conditional step execution", async () => {
    const flow = createFlow({
      name: "conditional",
      steps: [
        makeAgent("check", (msg) => (msg.includes("skip") ? "SKIP" : "CONTINUE")),
        makeAgent("work", "done"),
      ],
      execute: async (steps, message, ctx) => {
        const check = await ctx.runStep(steps[0]!, message);
        if (check.text === "SKIP") return check.text;
        const work = await ctx.runStep(steps[1]!, check.text);
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
        const r = await ctx.runStep(steps[0]!, message);
        return r.text;
      },
    });

    await expect(flow.call("test")).rejects.toThrow(FlowExecutionError);
    await expect(flow.call("test")).rejects.toThrow('Step "bad" failed: oops');
  });
});

// Step hooks (beforeStep / afterStep)

describe("step hooks", () => {
  it("fires beforeStep and afterStep for each step", async () => {
    const events: string[] = [];

    const config: FlowConfig = {
      name: "test-flow",
      steps: [makeAgent("agent-a", "hello"), makeAgent("agent-b", "world")],
    };

    const flow = buildFlowAgent(config, "test", {}, async (steps, _msg, ctx) => {
      await ctx.runStep(steps[0]!, "input1");
      await ctx.runStep(steps[1]!, "input2");
      return "done";
    });

    hookIntoFlow(flow, {
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
    });

    await flow.call("ignored");

    expect(events).toEqual([
      "before:agent-a:input1",
      "after:agent-a:input1:hello",
      "before:agent-b:input2",
      "after:agent-b:input2:world",
    ]);
  });

  it("fires step hooks within buildFlowAgent-based flows", async () => {
    const events: string[] = [];

    const config: FlowConfig = {
      name: "hooked-pipe",
      steps: [makeAgent("a", "first"), makeAgent("b", "second")],
    };

    const flow = buildFlowAgent(config, "pipeline", {}, async (steps, message, ctx) => {
      let current = message;
      for (const step of steps) {
        const r = await ctx.runStep(step, current);
        current = r.text;
      }
      return current;
    });

    hookIntoFlow(flow, {
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
    });

    await flow.call("start");

    expect(events).toEqual(["before:a", "after:a:first", "before:b", "after:b:second"]);
  });

  it("fires step hooks within createFlow-based flows", async () => {
    const events: string[] = [];

    const flow = createFlow({
      name: "custom-hooked",
      steps: [makeAgent("x", "output")],
      execute: async (steps, message, ctx) => {
        const r = await ctx.runStep(steps[0]!, message);
        return r.text;
      },
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

    await flow.call("msg");

    expect(events).toEqual(["before:x:msg", "after:x:output"]);
  });

  it("step hooks fire alongside flow-level hooks in correct order", async () => {
    const order: string[] = [];

    const config: FlowConfig = {
      name: "ordered",
      steps: [makeAgent("a", "response")],
    };

    const flow = buildFlowAgent(config, "test", {}, async (steps, message, ctx) => {
      const r = await ctx.runStep(steps[0]!, message);
      return r.text;
    });

    hookIntoFlow(flow, {
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
    });

    await flow.call("input");

    expect(order).toEqual(["flow-before", "step-before:a", "step-after:a", "flow-after"]);
  });

  it("afterStep does not fire if step throws", async () => {
    const events: string[] = [];

    const config: FlowConfig = {
      name: "test-flow",
      steps: [makeFailingAgent("bad", new Error("boom"))],
    };

    const flow = buildFlowAgent(config, "test", {}, async (steps, msg, ctx) => {
      const r = await ctx.runStep(steps[0]!, msg);
      return r.text;
    });

    hookIntoFlow(flow, {
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
    });

    await expect(flow.call("msg")).rejects.toThrow(FlowExecutionError);

    // beforeStep fires, afterStep does not
    expect(events).toEqual(["before"]);
  });
});
