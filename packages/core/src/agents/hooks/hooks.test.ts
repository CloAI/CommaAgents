// Tests for agent hook utilities (agents/hooks.ts)

import { describe, expect, it } from "bun:test";
import { z } from "zod";
import { okResult } from "../../tools/result";
import { buildAgentToolSet } from "../agent/agent.utils";
import { resolveHook } from "./hooks.utils";

// resolveHook

describe("resolveHook", () => {
  const initial = [() => "initial"];
  const regular = [() => "regular"];

  it("should return initial hooks on first call when defined", () => {
    expect(resolveHook(initial, regular, true)).toBe(initial);
  });

  it("should fall back to regular hooks on first call when initial undefined", () => {
    expect(resolveHook(undefined, regular, true)).toBe(regular);
  });

  it("should return regular hooks on subsequent calls", () => {
    expect(resolveHook(initial, regular, false)).toBe(regular);
  });

  it("should return undefined when no hooks defined", () => {
    expect(resolveHook(undefined, undefined, true)).toBeUndefined();
    expect(resolveHook(undefined, undefined, false)).toBeUndefined();
  });

  it("should ignore initial hooks on subsequent calls even if defined", () => {
    expect(resolveHook(initial, undefined, false)).toBeUndefined();
  });
});

// buildAgentToolSet — tool hook integration

describe("buildAgentToolSet with ToolHooks", () => {
  const echoTool = {
    description: "Echo tool",
    parameters: z.object({ text: z.string() }),
    execute: async (args: { text: string }) => okResult(`echo:${args.text}`),
  };

  /** Call execute on a wrapped AI SDK tool (non-null asserted — we know execute exists). */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- AI SDK tool generics are complex
  async function callTool(tool: any, args: any): Promise<any> {
    return tool.execute(args, { abortSignal: AbortSignal.timeout(5000) });
  }

  it("should fire beforeToolCall hook with tool name and args", async () => {
    const log: Array<{ name: string; args: string }> = [];

    const toolSet = buildAgentToolSet({ echo: echoTool }, "test-agent", {
      beforeToolCall: [
        async (ctx) => {
          log.push({ name: ctx.name, args: ctx.args });
        },
      ],
    })!;

    expect(toolSet).toBeDefined();
    await callTool(toolSet.echo, { text: "hello" });

    expect(log).toEqual([{ name: "echo", args: '{"text":"hello"}' }]);
  });

  it("should fire afterToolCall hook with tool name, args, and result", async () => {
    const log: Array<{ name: string; args: string; result: string }> = [];

    const toolSet = buildAgentToolSet({ echo: echoTool }, "test-agent", {
      afterToolCall: [
        async (ctx) => {
          log.push({ name: ctx.name, args: ctx.args, result: ctx.result });
        },
      ],
    })!;

    await callTool(toolSet.echo, { text: "world" });

    expect(log).toEqual([
      { name: "echo", args: '{"text":"world"}', result: "echo:world" },
    ]);
  });

  it("should fire both before and after hooks in order", async () => {
    const log: string[] = [];

    const toolSet = buildAgentToolSet({ echo: echoTool }, "test-agent", {
      beforeToolCall: [
        async ({ name }) => {
          log.push(`before:${name}`);
        },
      ],
      afterToolCall: [
        async ({ name, result }) => {
          log.push(`after:${name}:${result}`);
        },
      ],
    })!;

    await callTool(toolSet.echo, { text: "test" });

    expect(log).toEqual(["before:echo", "after:echo:echo:test"]);
  });

  it("should work without tool hooks (undefined)", async () => {
    const toolSet = buildAgentToolSet(
      { echo: echoTool },
      "test-agent",
      undefined,
    )!;

    const result = await callTool(toolSet.echo, { text: "hi" });
    expect(result).toBe("echo:hi");
  });

  it("should fire hooks for multiple tools independently", async () => {
    const log: string[] = [];

    const addTool = {
      description: "Add tool",
      parameters: z.object({ a: z.number(), b: z.number() }),
      execute: async (args: { a: number; b: number }) =>
        okResult(String(args.a + args.b)),
    };

    const toolSet = buildAgentToolSet(
      { echo: echoTool, add: addTool },
      "test-agent",
      {
        beforeToolCall: [
          async ({ name }) => {
            log.push(`before:${name}`);
          },
        ],
        afterToolCall: [
          async ({ name }) => {
            log.push(`after:${name}`);
          },
        ],
      },
    )!;

    await callTool(toolSet.echo, { text: "x" });
    await callTool(toolSet.add, { a: 1, b: 2 });

    expect(log).toEqual([
      "before:echo",
      "after:echo",
      "before:add",
      "after:add",
    ]);
  });
});

// Universal argument validation + error surfacing — regression cover for
// the "edit_file infinite-retry loop" bug where AI SDK v6 does not
// enforce `inputSchema` and bare throws from `execute` surfaced to the
// LLM as empty strings, giving it no signal to self-correct.

describe("buildAgentToolSet argument validation and error surfacing", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- AI SDK tool generics
  async function callTool(tool: any, args: unknown): Promise<unknown> {
    return tool.execute(args, { abortSignal: AbortSignal.timeout(5000) });
  }

  const strictTool = {
    description: "Strict tool requiring path and value",
    parameters: z.object({
      path: z.string().min(1),
      value: z.string().min(1),
    }),
    execute: async (args: { path: string; value: string }) =>
      okResult(`wrote ${args.value} to ${args.path}`),
  };

  it("rejects calls with empty args and tells the LLM what's missing", async () => {
    const toolSet = buildAgentToolSet({ strict: strictTool }, "test-agent")!;

    const output = (await callTool(toolSet.strict, {})) as string;
    expect(typeof output).toBe("string");
    // The LLM-facing output must call out both missing fields by name,
    // include the received args, and suggest a recoverable next step.
    expect(output).toContain("Invalid arguments for `strict`");
    expect(output).toContain("path");
    expect(output).toContain("value");
    expect(output).toContain("Received: {}");
    expect(output).toContain("Next step:");
  });

  it("rejects partial args with a per-field diagnostic", async () => {
    const toolSet = buildAgentToolSet({ strict: strictTool }, "test-agent")!;

    const output = (await callTool(toolSet.strict, {
      path: "ok.ts",
      // value missing
    })) as string;
    expect(output).toContain("Invalid arguments for `strict`");
    expect(output).toContain("value");
    // path was valid — error should not call it out
    expect(output).not.toMatch(/^- `path`:/m);
  });

  it("surfaces thrown errors from execute as a structured tool result, not empty string", async () => {
    // The previous behaviour: AI SDK swallowed throws and the LLM
    // saw `output=0 chars`, triggering infinite-retry loops.
    const throwingTool = {
      description: "Always throws",
      parameters: z.object({ x: z.string() }),
      execute: async () => {
        throw new Error("oops, internal failure");
      },
    };

    const toolSet = buildAgentToolSet({ throwy: throwingTool }, "test-agent")!;

    const output = (await callTool(toolSet.throwy, { x: "ok" })) as string;
    expect(output.length).toBeGreaterThan(0);
    expect(output).toContain("oops, internal failure");
    // Recoverable suggestion present so the LLM knows it can retry.
    expect(output).toContain("Next step:");
  });

  it("passes the validated (typed) args through to execute on the happy path", async () => {
    let receivedArgs: unknown;
    const observingTool = {
      description: "Records its args",
      parameters: z.object({ a: z.number(), b: z.string() }),
      execute: async (args: { a: number; b: string }) => {
        receivedArgs = args;
        return okResult("ok");
      },
    };

    const toolSet = buildAgentToolSet(
      { observe: observingTool },
      "test-agent",
    )!;

    await callTool(toolSet.observe, { a: 42, b: "hello" });
    expect(receivedArgs).toEqual({ a: 42, b: "hello" });
  });

  it("returns a single result per call (no AI SDK swallow / double-call)", async () => {
    let callCount = 0;
    const tool = {
      description: "Counts calls",
      parameters: z.object({ id: z.string() }),
      execute: async () => {
        callCount += 1;
        return okResult(`call #${callCount}`);
      },
    };

    const toolSet = buildAgentToolSet({ counter: tool }, "test-agent")!;
    const output = (await callTool(toolSet.counter, { id: "one" })) as string;
    expect(callCount).toBe(1);
    expect(output).toBe("call #1");
  });
});
