// Tests for createSequentialFlow.

import { describe, expect, it } from "bun:test";
import type { Agent } from "../../../agents/agent/agent.types";
import { FlowExecutionError } from "../../../errors/index";
import type { FlowHooks, FlowResult } from "../../flow/flow.types";
import { makeAgent } from "../../test.utils";
import { createSequentialFlow } from "./sequential-flow";

// Tests

describe("createSequentialFlow", () => {
  it("chains agents in sequence — output of one is input of next", async () => {
    const flow = createSequentialFlow({
      name: "pipe",
      steps: [
        makeAgent("a", (msg) => `A(${msg})`),
        makeAgent("b", (msg) => `B(${msg})`),
        makeAgent("c", (msg) => `C(${msg})`),
      ],
    });

    const result = await flow.call("start");
    expect(result.text).toBe("C(B(A(start)))");
  });

  it("works with a single step", async () => {
    const flow = createSequentialFlow({
      name: "single",
      steps: [makeAgent("a", (msg) => `done:${msg}`)],
    });

    const result = await flow.call("hello");
    expect(result.text).toBe("done:hello");
  });

  it("returns FlowResult with per-step results", async () => {
    const flow = createSequentialFlow({
      name: "pipe",
      steps: [makeAgent("a", "first"), makeAgent("b", "second")],
    });

    const result = (await flow.call("start")) as FlowResult;

    expect(result.stepResults).toHaveLength(2);
    expect(result.stepResults[0]!.text).toBe("first");
    expect(result.stepResults[1]!.text).toBe("second");
  });

  it("aggregates token usage across steps", async () => {
    const flow = createSequentialFlow({
      name: "pipe",
      steps: [
        makeAgent("a", "x", { promptTokens: 3, completionTokens: 7 }),
        makeAgent("b", "y", { promptTokens: 3, completionTokens: 7 }),
        makeAgent("c", "z", { promptTokens: 3, completionTokens: 7 }),
      ],
    });

    const result = await flow.call("start");

    expect(result.usage.promptTokens).toBe(9);
    expect(result.usage.completionTokens).toBe(21);
  });

  it("has correct name", () => {
    const flow = createSequentialFlow({
      name: "my-pipeline",
      steps: [makeAgent("a", "x")],
    });

    expect(flow.name).toBe("my-pipeline");
  });

  it("throws for empty steps", () => {
    expect(() => createSequentialFlow({ name: "empty", steps: [] })).toThrow(FlowExecutionError);
  });

  it("wraps step errors in FlowExecutionError", async () => {
    const failing: Agent = {
      name: "bad",
      async call() {
        throw new Error("oops");
      },
      reset() {},
    };

    const flow = createSequentialFlow({
      name: "pipe",
      steps: [makeAgent("a", (msg) => msg), failing],
    });

    await expect(flow.call("test")).rejects.toThrow(FlowExecutionError);
    await expect(flow.call("test")).rejects.toThrow('Step "bad" failed: oops');
  });

  it("applies flow hooks", async () => {
    const hooks: FlowHooks = {
      alterMessageBeforeFlow: [async (msg) => `[${msg}]`],
      alterMessageAfterFlow: [async (msg) => msg.toUpperCase()],
    };

    const flow = createSequentialFlow({
      name: "hooked",
      steps: [makeAgent("a", (msg) => `echo:${msg}`)],
      hooks,
    });

    const result = await flow.call("hi");

    // Input: "hi" → alter-before: "[hi]" → agent: "echo:[hi]" → alter-after: "ECHO:[HI]"
    expect(result.text).toBe("ECHO:[HI]");
  });

  it("reset() propagates to all steps", () => {
    const resets: string[] = [];
    const step1: Agent = {
      name: "s1",
      async call() {
        return {
          text: "",
          usage: { promptTokens: 0, completionTokens: 0 },
          finishReason: "stop",
        };
      },
      reset() {
        resets.push("s1");
      },
    };
    const step2: Agent = {
      name: "s2",
      async call() {
        return {
          text: "",
          usage: { promptTokens: 0, completionTokens: 0 },
          finishReason: "stop",
        };
      },
      reset() {
        resets.push("s2");
      },
    };

    const flow = createSequentialFlow({ name: "pipe", steps: [step1, step2] });
    flow.reset();

    expect(resets).toEqual(["s1", "s2"]);
  });

  it("composes with nested flows", async () => {
    const inner = createSequentialFlow({
      name: "inner",
      steps: [makeAgent("ia", (msg) => `inner(${msg})`)],
    });

    const outer = createSequentialFlow({
      name: "outer",
      steps: [
        makeAgent("oa", (msg) => `pre:${msg}`),
        inner,
        makeAgent("ob", (msg) => `post:${msg}`),
      ],
    });

    const result = await outer.call("start");
    // pre:start → inner(pre:start) → post:inner(pre:start)
    expect(result.text).toBe("post:inner(pre:start)");
  });
});
