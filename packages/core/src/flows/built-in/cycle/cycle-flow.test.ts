// Tests for createCycleFlow.

import { describe, expect, it } from "bun:test";
import type { Agent } from "../../../agents/agent/agent.types";
import { FlowExecutionError } from "../../../errors/index";
import type { CycleHooks, FlowResult } from "../../flow/flow.types";
import { hookIntoFlow } from "../../hook-into-flow/hook-into-flow";
import { makeAgent, makeCountingAgent } from "../../test.utils";
import { createCycleFlow } from "./cycle-flow";

// Basic cycle behavior

describe("createCycleFlow", () => {
  it("runs steps once with default cycles", async () => {
    const flow = createCycleFlow({
      name: "cycle",
      steps: [makeAgent("a", (msg) => `A(${msg})`)],
    });

    const result = await flow.call("start");
    expect(result.text).toBe("A(start)");
  });

  it("runs steps N times with finite cycles", async () => {
    const { agent, getCount } = makeCountingAgent("a");
    const flow = createCycleFlow({
      name: "cycle",
      steps: [agent],
      cycles: 3,
    });

    const result = await flow.call("x");
    expect(getCount()).toBe(3);
    // Each cycle: msg → "msg[a:N]"
    // Cycle 1: "x" → "x[a:1]"
    // Cycle 2: "x[a:1]" → "x[a:1][a:2]"
    // Cycle 3: "x[a:1][a:2]" → "x[a:1][a:2][a:3]"
    expect(result.text).toBe("x[a:1][a:2][a:3]");
  });

  it("chains output of one cycle as input to the next", async () => {
    const flow = createCycleFlow({
      name: "chain",
      steps: [makeAgent("a", (msg) => `(${msg})`)],
      cycles: 3,
    });

    const result = await flow.call("x");
    // Cycle 1: "x" → "(x)"
    // Cycle 2: "(x)" → "((x))"
    // Cycle 3: "((x))" → "(((x)))"
    expect(result.text).toBe("(((x)))");
  });

  it("runs multiple steps per cycle in sequence", async () => {
    const flow = createCycleFlow({
      name: "multi",
      steps: [
        makeAgent("a", (msg) => `A(${msg})`),
        makeAgent("b", (msg) => `B(${msg})`),
      ],
      cycles: 2,
    });

    const result = await flow.call("x");
    // Cycle 1: "x" → A → "A(x)" → B → "B(A(x))"
    // Cycle 2: "B(A(x))" → A → "A(B(A(x)))" → B → "B(A(B(A(x))))"
    expect(result.text).toBe("B(A(B(A(x))))");
  });

  it("returns FlowResult with all step results", async () => {
    const flow = createCycleFlow({
      name: "cycle",
      steps: [makeAgent("a", "out")],
      cycles: 3,
    });

    const result = (await flow.call("in")) as FlowResult;

    // 3 cycles × 1 step = 3 step results
    expect(result.stepResults).toHaveLength(3);
  });

  it("aggregates token usage across all cycles", async () => {
    const flow = createCycleFlow({
      name: "cycle",
      steps: [makeAgent("a", "out", { promptTokens: 2, completionTokens: 4 })],
      cycles: 3,
    });

    const result = await flow.call("in");

    // 3 calls × (2 prompt + 4 completion)
    expect(result.usage.promptTokens).toBe(6);
    expect(result.usage.completionTokens).toBe(12);
  });

  it("has correct name", () => {
    const flow = createCycleFlow({
      name: "my-cycle",
      steps: [makeAgent("a", "x")],
    });
    expect(flow.name).toBe("my-cycle");
  });

  it("throws for empty steps", () => {
    expect(() => createCycleFlow({ name: "empty", steps: [] })).toThrow(
      FlowExecutionError,
    );
  });
});

// Infinite cycles

describe("createCycleFlow (infinite)", () => {
  it("accepts cycles=Infinity without abort signal", () => {
    // Infinite cycles are now allowed without config-level abort.
    // Cancellation happens at the call level via AbortablePromise.
    expect(() =>
      createCycleFlow({
        name: "inf",
        steps: [makeAgent("a", "x")],
        cycles: Infinity,
      }),
    ).not.toThrow();
  });
});

// Cycle hooks

describe("createCycleFlow (cycle hooks)", () => {
  it("runs alterMessageBeforeCycle before each cycle", async () => {
    let cycleNum = 0;

    const flow = createCycleFlow({
      name: "hooked",
      steps: [makeAgent("a", (msg) => msg)],
      cycles: 2,
    });

    hookIntoFlow<CycleHooks>(flow, {
      alterMessageBeforeCycle: [
        async (msg) => {
          cycleNum++;
          return `[cycle${cycleNum}]${msg}`;
        },
      ],
    });

    const result = await flow.call("x");
    // Cycle 1: before → "[cycle1]x" → agent → "[cycle1]x"
    // Cycle 2: before → "[cycle2][cycle1]x" → agent → "[cycle2][cycle1]x"
    expect(result.text).toBe("[cycle2][cycle1]x");
  });

  it("runs alterMessageAfterCycle after each cycle", async () => {
    const flow = createCycleFlow({
      name: "hooked",
      steps: [makeAgent("a", (msg) => msg)],
      cycles: 3,
    });

    hookIntoFlow<CycleHooks>(flow, {
      alterMessageAfterCycle: [async (msg) => `${msg}!`],
    });

    const result = await flow.call("x");
    // Cycle 1: "x" → agent → "x" → after → "x!"
    // Cycle 2: "x!" → agent → "x!" → after → "x!!"
    // Cycle 3: "x!!" → agent → "x!!" → after → "x!!!"
    expect(result.text).toBe("x!!!");
  });

  it("applies flow-level hooks around entire cycle", async () => {
    const order: string[] = [];

    const flow = createCycleFlow({
      name: "hooked",
      steps: [
        makeAgent("a", (msg) => {
          order.push("execute");
          return msg;
        }),
      ],
      cycles: 2,
    });

    hookIntoFlow<CycleHooks>(flow, {
      alterMessageBeforeFlow: [
        async (msg) => {
          order.push("flow-before");
          return msg;
        },
      ],
      afterFlow: [
        async () => {
          order.push("flow-after");
        },
      ],
      alterMessageBeforeCycle: [
        async (msg) => {
          order.push("cycle-before");
          return msg;
        },
      ],
      alterMessageAfterCycle: [
        async (msg) => {
          order.push("cycle-after");
          return msg;
        },
      ],
    });

    await flow.call("x");

    expect(order).toEqual([
      "flow-before",
      "cycle-before",
      "execute",
      "cycle-after", // cycle 1
      "cycle-before",
      "execute",
      "cycle-after", // cycle 2
      "flow-after",
    ]);
  });
});

// Observer

describe("createCycleFlow (observer)", () => {
  it("runs observer after each cycle", async () => {
    const observer = makeAgent("critic", (msg) => `reviewed:${msg}`);

    const flow = createCycleFlow({
      name: "observed",
      steps: [makeAgent("writer", (msg) => `wrote:${msg}`)],
      cycles: 2,
      observer,
    });

    const result = await flow.call("topic");
    // Cycle 1: "topic" → writer → "wrote:topic" → observer → "reviewed:wrote:topic"
    // Cycle 2: "reviewed:wrote:topic" → writer → "wrote:reviewed:wrote:topic" → observer → "reviewed:wrote:reviewed:wrote:topic"
    expect(result.text).toBe("reviewed:wrote:reviewed:wrote:topic");
  });

  it("observer runs before user-provided alterMessageAfterCycle hooks", async () => {
    const order: string[] = [];
    const observer: Agent = {
      name: "obs",
      async call(msg) {
        order.push("observer");
        return {
          text: msg,
          usage: { promptTokens: 0, completionTokens: 0 },
          finishReason: "stop",
        };
      },
      reset() {},
    };

    const flow = createCycleFlow({
      name: "observed",
      steps: [makeAgent("a", (msg) => msg)],
      cycles: 1,
      observer,
    });

    hookIntoFlow<CycleHooks>(flow, {
      alterMessageAfterCycle: [
        async (msg) => {
          order.push("user-hook");
          return msg;
        },
      ],
    });

    await flow.call("x");

    expect(order).toEqual(["observer", "user-hook"]);
  });

  it("reset() also resets the observer", () => {
    const resets: string[] = [];
    const observer: Agent = {
      name: "obs",
      async call() {
        return {
          text: "",
          usage: { promptTokens: 0, completionTokens: 0 },
          finishReason: "stop",
        };
      },
      reset() {
        resets.push("observer");
      },
    };
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
        resets.push("step");
      },
    };

    const flow = createCycleFlow({
      name: "obs",
      steps: [step],
      cycles: 1,
      observer,
    });

    flow.reset();
    expect(resets).toEqual(["step", "observer"]);
  });
});

// Composition

describe("createCycleFlow (composition)", () => {
  it("can be nested inside a sequential flow", async () => {
    // We test that a cycle flow satisfies the Agent interface
    // by using it as a step in manual composition
    const cycle = createCycleFlow({
      name: "inner-cycle",
      steps: [makeAgent("a", (msg) => `(${msg})`)],
      cycles: 2,
    });

    // Manually compose: pre → cycle → post
    const preResult = await makeAgent("pre", (msg) => `pre:${msg}`).call(
      "start",
    );
    const cycleResult = await cycle.call(preResult.text);
    const postResult = await makeAgent("post", (msg) => `post:${msg}`).call(
      cycleResult.text,
    );

    // pre:start → ((pre:start)) → post:((pre:start))
    expect(postResult.text).toBe("post:((pre:start))");
  });
});

// Step hooks within cycle flow

describe("createCycleFlow (step hooks)", () => {
  it("fires beforeStep and afterStep for each step in each cycle", async () => {
    const events: string[] = [];

    const flow = createCycleFlow({
      name: "hooked-cycle",
      steps: [makeAgent("a", (msg) => `A(${msg})`)],
      cycles: 2,
    });

    hookIntoFlow<CycleHooks>(flow, {
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

    await flow.call("x");

    expect(events).toEqual([
      "before:a:x",
      "after:a:A(x)",
      "before:a:A(x)",
      "after:a:A(A(x))",
    ]);
  });

  it("step hooks fire alongside cycle-level hooks in correct order", async () => {
    const order: string[] = [];

    const flow = createCycleFlow({
      name: "ordered",
      steps: [makeAgent("a", (msg) => msg)],
      cycles: 2,
    });

    hookIntoFlow<CycleHooks>(flow, {
      alterMessageBeforeCycle: [
        async (msg) => {
          order.push("cycle-before");
          return msg;
        },
      ],
      alterMessageAfterCycle: [
        async (msg) => {
          order.push("cycle-after");
          return msg;
        },
      ],
      beforeStep: [
        () => {
          order.push("step-before");
        },
      ],
      afterStep: [
        () => {
          order.push("step-after");
        },
      ],
    });

    await flow.call("x");

    expect(order).toEqual([
      "cycle-before",
      "step-before",
      "step-after",
      "cycle-after",
      "cycle-before",
      "step-before",
      "step-after",
      "cycle-after",
    ]);
  });

  it("fires step hooks for multiple steps within a single cycle", async () => {
    const events: string[] = [];

    const flow = createCycleFlow({
      name: "multi-step",
      steps: [
        makeAgent("a", (msg) => `A(${msg})`),
        makeAgent("b", (msg) => `B(${msg})`),
      ],
      cycles: 1,
    });

    hookIntoFlow<CycleHooks>(flow, {
      beforeStep: [
        ({ stepName }) => {
          events.push(`before:${stepName}`);
        },
      ],
      afterStep: [
        ({ stepName }) => {
          events.push(`after:${stepName}`);
        },
      ],
    });

    await flow.call("x");

    expect(events).toEqual(["before:a", "after:a", "before:b", "after:b"]);
  });
});
