// Tests for createBroadcastFlow.

import { describe, expect, it } from "bun:test";
import type { Agent } from "../../../agents/agent/agent.types";
import { FlowExecutionError } from "../../../errors/index";
import type { FlowHooks, FlowResult } from "../../flow/flow.types";
import { makeAgent } from "../../test.utils";
import { createBroadcastFlow } from "./broadcast-flow";

// Tests

describe("createBroadcastFlow", () => {
  it("sends the same message to all steps", async () => {
    const messages: string[] = [];
    const recorder = (name: string): Agent => ({
      name,
      async call(msg) {
        messages.push(`${name}:${msg}`);
        return {
          text: name,
          usage: { promptTokens: 0, completionTokens: 0 },
          finishReason: "stop",
        };
      },
      reset() {},
    });

    const flow = createBroadcastFlow({
      name: "broadcast",
      steps: [recorder("a"), recorder("b"), recorder("c")],
    });

    await flow.call("hello");

    // All agents should receive the same message
    expect(messages).toEqual(["a:hello", "b:hello", "c:hello"]);
  });

  it("joins responses with default separator (double newline)", async () => {
    const flow = createBroadcastFlow({
      name: "broadcast",
      steps: [makeAgent("a", "first"), makeAgent("b", "second"), makeAgent("c", "third")],
    });

    const result = await flow.call("input");
    expect(result.text).toBe("first\n\nsecond\n\nthird");
  });

  it("joins responses with custom separator", async () => {
    const flow = createBroadcastFlow({
      name: "broadcast",
      steps: [makeAgent("a", "one"), makeAgent("b", "two")],
      separator: " | ",
    });

    const result = await flow.call("input");
    expect(result.text).toBe("one | two");
  });

  it("works with single step", async () => {
    const flow = createBroadcastFlow({
      name: "single",
      steps: [makeAgent("a", "only")],
    });

    const result = await flow.call("input");
    expect(result.text).toBe("only");
  });

  it("returns FlowResult with per-step results", async () => {
    const flow = createBroadcastFlow({
      name: "broadcast",
      steps: [makeAgent("a", "first"), makeAgent("b", "second")],
    });

    const result = (await flow.call("input")) as FlowResult;

    expect(result.stepResults).toHaveLength(2);
    expect(result.stepResults[0]?.text).toBe("first");
    expect(result.stepResults[1]?.text).toBe("second");
  });

  it("aggregates token usage", async () => {
    const flow = createBroadcastFlow({
      name: "broadcast",
      steps: [
        makeAgent("a", "x", { promptTokens: 3, completionTokens: 5 }),
        makeAgent("b", "y", { promptTokens: 3, completionTokens: 5 }),
        makeAgent("c", "z", { promptTokens: 3, completionTokens: 5 }),
      ],
    });

    const result = await flow.call("input");

    // 3 steps × (3 prompt + 5 completion)
    expect(result.usage.promptTokens).toBe(9);
    expect(result.usage.completionTokens).toBe(15);
  });

  it("has correct name", () => {
    const flow = createBroadcastFlow({
      name: "my-broadcast",
      steps: [makeAgent("a", "x")],
    });
    expect(flow.name).toBe("my-broadcast");
  });

  it("throws for empty steps", () => {
    expect(() => createBroadcastFlow({ name: "empty", steps: [] })).toThrow(FlowExecutionError);
  });

  it("wraps step errors in FlowExecutionError", async () => {
    const failing: Agent = {
      name: "bad",
      async call() {
        throw new Error("fail");
      },
      reset() {},
    };

    const flow = createBroadcastFlow({
      name: "broadcast",
      steps: [makeAgent("a", "ok"), failing],
    });

    await expect(flow.call("test")).rejects.toThrow(FlowExecutionError);
    await expect(flow.call("test")).rejects.toThrow('Step "bad" failed: fail');
  });

  it("applies flow hooks", async () => {
    const hooks: FlowHooks = {
      alterMessageBeforeFlow: [async (msg) => `[${msg}]`],
      alterMessageAfterFlow: [async (msg) => msg.toUpperCase()],
    };

    const flow = createBroadcastFlow({
      name: "hooked",
      steps: [makeAgent("a", (msg) => `a:${msg}`), makeAgent("b", (msg) => `b:${msg}`)],
      hooks,
    });

    const result = await flow.call("hi");

    // Input: "hi" → alter-before: "[hi]"
    // All steps get "[hi]": a → "a:[hi]", b → "b:[hi]"
    // Joined: "a:[hi]\n\nb:[hi]"
    // alter-after: "A:[HI]\n\nB:[HI]"
    expect(result.text).toBe("A:[HI]\n\nB:[HI]");
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

    const flow = createBroadcastFlow({ name: "b", steps: [step1, step2] });
    flow.reset();

    expect(resets).toEqual(["s1", "s2"]);
  });

  it("each step gets original message, not previous step output", async () => {
    // This is the key difference from sequential: each step gets the SAME input
    const flow = createBroadcastFlow({
      name: "broadcast",
      steps: [makeAgent("a", (msg) => `modified:${msg}`), makeAgent("b", (msg) => `got:${msg}`)],
    });

    const result = (await flow.call("original")) as FlowResult;

    // Step b should get "original", NOT "modified:original"
    expect(result.stepResults[1]?.text).toBe("got:original");
  });
});

// Step hooks within broadcast flow

describe("createBroadcastFlow (step hooks)", () => {
  it("fires beforeStep and afterStep for each step", async () => {
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

    const flow = createBroadcastFlow({
      name: "hooked-broadcast",
      steps: [makeAgent("a", "alpha"), makeAgent("b", "beta")],
      hooks,
    });

    await flow.call("input");

    // Broadcast sends same message to all steps
    expect(events).toEqual(["before:a:input", "after:a:alpha", "before:b:input", "after:b:beta"]);
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

    const flow = createBroadcastFlow({
      name: "ordered",
      steps: [makeAgent("a", "out-a"), makeAgent("b", "out-b")],
      hooks,
    });

    await flow.call("msg");

    expect(order).toEqual([
      "flow-before",
      "step-before:a",
      "step-after:a",
      "step-before:b",
      "step-after:b",
      "flow-after",
    ]);
  });
});
