/**
 * Deterministic test tools for E2E tests.
 *
 * These tools have no real side effects — they return predictable results
 * suitable for automated testing. Each factory creates a ToolDef that can
 * be passed to createAgent's `tools` config.
 *
 * @example
 * ```ts
 * const agent = createAgent({
 *   name: "test",
 *   model,
 *   tools: {
 *     echo: createEchoTool(),
 *     counter: createCounterTool(),
 *   },
 * });
 * ```
 */

import { z } from "zod";
import { defineTool } from "@comma-agents/core";
import type { ToolDef } from "@comma-agents/core";

// Echo tool — returns its input as output

/**
 * A tool that echoes its input back. Useful for verifying that the model's
 * tool call arguments are correctly passed through the system.
 */
export function createEchoTool(): ToolDef {
  return defineTool({
    description: "Echo the input message back. Useful for testing.",
    parameters: z.object({
      message: z.string().describe("The message to echo back"),
    }),
    execute: async (args) => ({
      output: `echo: ${args.message}`,
      metadata: { echoed: args.message },
    }),
  });
}

// Counter tool — returns an incrementing count

/**
 * A tool that returns an incrementing counter. Useful for verifying
 * how many times a tool is called and in what order.
 */
export function createCounterTool(): { tool: ToolDef; getCount: () => number } {
  let count = 0;

  const tool = defineTool({
    description: "Increment and return a counter. Returns the current count.",
    parameters: z.object({}),
    execute: async () => {
      count++;
      return {
        output: `count: ${count}`,
        metadata: { count },
      };
    },
  });

  return { tool, getCount: () => count };
}

// Lookup tool — returns values from a predefined map

/**
 * A tool that looks up values from a predefined map. Useful for simulating
 * data retrieval (weather, database, API calls) with deterministic results.
 */
export function createLookupTool(
  data: Record<string, string>,
  options?: { name?: string; description?: string },
): ToolDef {
  return defineTool({
    description: options?.description ?? "Look up a value by key.",
    parameters: z.object({
      key: z.string().describe("The key to look up"),
    }),
    execute: async (args) => {
      const value = data[args.key];
      if (value === undefined) {
        return { output: `Error: key "${args.key}" not found` };
      }
      return {
        output: value,
        metadata: { key: args.key, value },
      };
    },
  });
}

// Failing tool — always throws

/**
 * A tool that always throws an error. Useful for testing error handling
 * and error propagation through the agent/flow system.
 */
export function createFailingTool(errorMessage = "Tool execution failed"): ToolDef {
  return defineTool({
    description: "A tool that always fails. For testing error handling.",
    parameters: z.object({
      input: z.string().optional().describe("Optional input (ignored)"),
    }),
    execute: async () => {
      throw new Error(errorMessage);
    },
  });
}

// Slow tool — resolves after a delay

/**
 * A tool that resolves after a configurable delay. Useful for testing
 * abort signal propagation and timeout behavior.
 */
export function createSlowTool(delayMs: number): ToolDef {
  return defineTool({
    description: `A tool that takes ${delayMs}ms to complete. For testing timeouts.`,
    parameters: z.object({
      input: z.string().optional().describe("Optional input to echo after delay"),
    }),
    execute: async (args, ctx) => {
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(resolve, delayMs);
        // Respect abort signal
        ctx.abort.addEventListener(
          "abort",
          () => {
            clearTimeout(timer);
            reject(new DOMException("Aborted", "AbortError"));
          },
          { once: true },
        );
      });
      return {
        output: `slow result: ${args.input ?? "done"}`,
      };
    },
  });
}

// Recording tool — records all calls for inspection

/** A recorded tool invocation. */
export interface ToolCallRecord {
  readonly args: Record<string, unknown>;
  readonly agentName: string;
  readonly timestamp: number;
}

/**
 * A tool that records all invocations for later inspection.
 * Returns a configurable response string.
 */
export function createRecordingTool(response = "recorded"): {
  tool: ToolDef;
  calls: ToolCallRecord[];
} {
  const calls: ToolCallRecord[] = [];

  const tool = defineTool({
    description: "A tool that records its invocations for testing.",
    parameters: z.object({
      input: z.string().optional().describe("Optional input"),
    }),
    execute: async (args, ctx) => {
      calls.push({
        args,
        agentName: ctx.agentName,
        timestamp: Date.now(),
      });
      return { output: response };
    },
  });

  return { tool, calls };
}
