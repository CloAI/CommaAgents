// Tests for defineTool helper

import { describe, expect, it } from "bun:test";
import { z } from "zod";
import { okResult } from "../result";
import { makeToolContext } from "../test.utils";
import { defineTool } from "./define-tool";

describe("defineTool", () => {
  it("should create a ToolDef with correct properties", () => {
    const tool = defineTool({
      description: "Get the weather",
      parameters: z.object({
        location: z.string(),
      }),
      execute: async ({ location }) =>
        okResult(`Weather in ${location}: sunny`),
    });

    expect(tool.description).toBe("Get the weather");
    expect(tool.parameters).toBeDefined();
    expect(typeof tool.execute).toBe("function");
  });

  it("should execute with correct args and context", async () => {
    const tool = defineTool({
      description: "Add numbers",
      parameters: z.object({
        a: z.number(),
        b: z.number(),
      }),
      execute: async ({ a, b }, ctx) =>
        okResult(`${a + b}`, { metadata: { agent: ctx.agentName } }),
    });

    const ctx = makeToolContext();

    const result = await tool.execute({ a: 3, b: 4 }, ctx);
    expect(result.ok).toBe(true);
    expect(result.output).toBe("7");
    expect(result.metadata).toEqual({ agent: "test-agent" });
  });

  it("should preserve the Zod schema for validation", () => {
    const schema = z.object({
      query: z.string().min(1),
      limit: z.number().optional(),
    });

    const tool = defineTool({
      description: "Search",
      parameters: schema,
      execute: async () => okResult("results"),
    });

    // The schema should work for validation
    const valid = tool.parameters.safeParse({ query: "hello" });
    expect(valid.success).toBe(true);

    const invalid = tool.parameters.safeParse({ query: "" });
    expect(invalid.success).toBe(false);
  });

  it("should allow optional metadata in result", async () => {
    const tool = defineTool({
      description: "No metadata",
      parameters: z.object({}),
      execute: async () => okResult("done"),
    });

    const ctx = makeToolContext();

    const result = await tool.execute({}, ctx);
    expect(result.output).toBe("done");
    expect(result.metadata).toBeUndefined();
  });

  it("should support flowName in context", async () => {
    let capturedFlowName: string | undefined;

    const tool = defineTool({
      description: "Capture context",
      parameters: z.object({}),
      execute: async (_args, ctx) => {
        capturedFlowName = ctx.flowName;
        return okResult("ok");
      },
    });

    const ctx = makeToolContext({
      agentName: "test",
      flowName: "review-pipeline",
    });

    await tool.execute({}, ctx);
    expect(capturedFlowName).toBe("review-pipeline");
  });
});
