// Tests for agent hook utilities (agents/hooks.ts)

import { describe, expect, it } from "bun:test";
import { z } from "zod";
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
    execute: async (args: { text: string }) => ({ output: `echo:${args.text}` }),
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

    expect(log).toEqual([{ name: "echo", args: '{"text":"world"}', result: "echo:world" }]);
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
    const toolSet = buildAgentToolSet({ echo: echoTool }, "test-agent", undefined)!;

    const result = await callTool(toolSet.echo, { text: "hi" });
    expect(result).toBe("echo:hi");
  });

  it("should fire hooks for multiple tools independently", async () => {
    const log: string[] = [];

    const addTool = {
      description: "Add tool",
      parameters: z.object({ a: z.number(), b: z.number() }),
      execute: async (args: { a: number; b: number }) => ({
        output: String(args.a + args.b),
      }),
    };

    const toolSet = buildAgentToolSet({ echo: echoTool, add: addTool }, "test-agent", {
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
    })!;

    await callTool(toolSet.echo, { text: "x" });
    await callTool(toolSet.add, { a: 1, b: 2 });

    expect(log).toEqual(["before:echo", "after:echo", "before:add", "after:add"]);
  });
});
