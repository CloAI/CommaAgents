// Tests for flow hook lifecycle middleware.

import { describe, expect, it, mock } from "bun:test";
import type { FlowHooks } from "../hooks/types";
import { withFlowHooks } from "./flow-hooks";
import type { FlowResult } from "./types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeFlowResult(text: string): FlowResult {
  return {
    text,
    steps: [],
    usage: { promptTokens: 0, completionTokens: 0 },
    finishReason: "stop",
    stepResults: [],
  };
}

// ---------------------------------------------------------------------------
// withFlowHooks
// ---------------------------------------------------------------------------

describe("withFlowHooks", () => {
  it("passes through when no hooks are provided", async () => {
    const executeFn = mock(async (msg: string) => makeFlowResult(msg));
    const hooked = withFlowHooks(undefined, executeFn);

    const result = await hooked("hello");

    expect(executeFn).toHaveBeenCalledTimes(1);
    expect(executeFn).toHaveBeenCalledWith("hello");
    expect(result.text).toBe("hello");
  });

  it("passes through when hooks object is empty", async () => {
    const executeFn = mock(async (msg: string) => makeFlowResult(msg));
    const hooked = withFlowHooks({}, executeFn);

    const result = await hooked("world");

    expect(result.text).toBe("world");
  });

  it("runs alterMessageBeforeFlow hooks before execute", async () => {
    const hooks: FlowHooks = {
      alterMessageBeforeFlow: [async (msg) => `[prefix] ${msg}`, async (msg) => `${msg} [suffix]`],
    };

    const receivedMessages: string[] = [];
    const executeFn = async (msg: string): Promise<FlowResult> => {
      receivedMessages.push(msg);
      return makeFlowResult(msg);
    };

    const hooked = withFlowHooks(hooks, executeFn);
    const result = await hooked("test");

    // Hooks chain: "test" → "[prefix] test" → "[prefix] test [suffix]"
    expect(receivedMessages[0]).toBe("[prefix] test [suffix]");
    expect(result.text).toBe("[prefix] test [suffix]");
  });

  it("runs beforeFlow side-effect hooks with altered message", async () => {
    const seen: string[] = [];
    const hooks: FlowHooks = {
      alterMessageBeforeFlow: [async (msg) => `altered:${msg}`],
      beforeFlow: [
        async (msg) => {
          seen.push(msg);
        },
      ],
    };

    const executeFn = async (msg: string): Promise<FlowResult> => makeFlowResult(msg);
    const hooked = withFlowHooks(hooks, executeFn);
    await hooked("input");

    expect(seen).toEqual(["altered:input"]);
  });

  it("runs afterFlow side-effect hooks with result text", async () => {
    const seen: string[] = [];
    const hooks: FlowHooks = {
      afterFlow: [
        async (msg) => {
          seen.push(msg);
        },
      ],
    };

    const executeFn = async (_msg: string): Promise<FlowResult> => makeFlowResult("response");
    const hooked = withFlowHooks(hooks, executeFn);
    await hooked("input");

    expect(seen).toEqual(["response"]);
  });

  it("runs alterMessageAfterFlow hooks on result text", async () => {
    const hooks: FlowHooks = {
      alterMessageAfterFlow: [async (msg) => msg.toUpperCase()],
    };

    const executeFn = async (_msg: string): Promise<FlowResult> => makeFlowResult("hello world");
    const hooked = withFlowHooks(hooks, executeFn);
    const result = await hooked("input");

    expect(result.text).toBe("HELLO WORLD");
  });

  it("runs all hooks in correct order", async () => {
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

    const executeFn = async (msg: string): Promise<FlowResult> => {
      order.push("execute");
      return makeFlowResult(msg);
    };

    const hooked = withFlowHooks(hooks, executeFn);
    await hooked("test");

    expect(order).toEqual(["alter-before", "before", "execute", "after", "alter-after"]);
  });

  it("preserves stepResults and other fields from the execute result", async () => {
    const stepResult = makeFlowResult("step1");
    const hooks: FlowHooks = {
      alterMessageAfterFlow: [async (msg) => `modified:${msg}`],
    };

    const executeFn = async (_msg: string): Promise<FlowResult> => ({
      text: "original",
      steps: [],
      usage: { promptTokens: 10, completionTokens: 20 },
      finishReason: "stop",
      stepResults: [stepResult],
    });

    const hooked = withFlowHooks(hooks, executeFn);
    const result = await hooked("test");

    // text is altered
    expect(result.text).toBe("modified:original");
    // other fields preserved
    expect(result.usage).toEqual({ promptTokens: 10, completionTokens: 20 });
    expect(result.stepResults).toEqual([stepResult]);
    expect(result.finishReason).toBe("stop");
  });

  it("chains multiple alter-after hooks", async () => {
    const hooks: FlowHooks = {
      alterMessageAfterFlow: [async (msg) => `(${msg})`, async (msg) => `[${msg}]`],
    };

    const executeFn = async (_msg: string): Promise<FlowResult> => makeFlowResult("x");
    const hooked = withFlowHooks(hooks, executeFn);
    const result = await hooked("test");

    // Chain: "x" → "(x)" → "[(x)]"
    expect(result.text).toBe("[(x)]");
  });
});
