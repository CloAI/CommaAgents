/**
 * 03 — Custom Tool
 *
 * Shows how to define your own tools with `defineTool()` and Zod parameter
 * schemas, then wire them into an agent alongside the built-in tools.
 *
 * This example creates a "weather" tool and a "calculator" tool to
 * demonstrate different parameter shapes and return patterns.
 *
 * Run:
 *   MODEL=openai/gpt-4o bun run examples/03-custom-tool.ts
 *
 * Concepts:
 *   - defineTool()    — declare a tool with description, Zod schema, execute fn
 *   - ToolContext      — metadata passed to execute (agentName, abort signal)
 *   - Mixing custom tools with built-in tools in a single agent
 *   - Zod schemas are sent to the LLM as JSON Schema for tool calling
 */

import { createAgent, createDefaultTools, defineTool } from "@comma-agents/core";
import { z } from "zod";
import { getModel } from "./helpers";

// ---------------------------------------------------------------------------
// Define custom tools
// ---------------------------------------------------------------------------

/**
 * A mock weather tool. In a real app this would call an external API.
 * The Zod schema tells the LLM what parameters to provide.
 */
const weatherTool = defineTool({
  description: "Get the current weather for a city. Returns temperature and conditions.",
  parameters: z.object({
    city: z.string().describe("The city name, e.g. 'San Francisco'"),
    unit: z
      .enum(["celsius", "fahrenheit"])
      .optional()
      .default("fahrenheit")
      .describe("Temperature unit"),
  }),
  execute: async (args, ctx) => {
    // ctx.agentName tells you which agent invoked this tool
    console.log(`  [weatherTool] Called by agent "${ctx.agentName}" for city: ${args.city}`);

    // Mock response — replace with a real API call
    const temp = args.unit === "celsius" ? "18°C" : "64°F";
    return {
      output: `Weather in ${args.city}: ${temp}, partly cloudy, humidity 65%.`,
      // Optional metadata — not sent to the LLM, but available in hooks
      metadata: { city: args.city, temp, source: "mock" },
    };
  },
});

/**
 * A simple calculator tool. Evaluates basic arithmetic expressions.
 * Demonstrates a tool that returns structured numeric results.
 */
const calculatorTool = defineTool({
  description: "Evaluate a basic arithmetic expression. Supports +, -, *, /, and parentheses.",
  parameters: z.object({
    expression: z.string().describe("The arithmetic expression to evaluate, e.g. '(2 + 3) * 4'"),
  }),
  execute: async (args, _ctx) => {
    try {
      // SAFETY NOTE: In production, use a proper math parser instead of eval.
      // This is a demo — we restrict to digits and arithmetic operators only.
      const sanitized = args.expression.replace(/[^0-9+\-*/().%\s]/g, "");
      if (sanitized !== args.expression.trim()) {
        return { output: "Error: expression contains invalid characters." };
      }
      // biome-ignore lint/security/noGlobalEval: demo-only arithmetic eval
      const result = eval(sanitized) as number;
      return {
        output: `${args.expression} = ${result}`,
        metadata: { expression: args.expression, result },
      };
    } catch {
      return { output: `Error: could not evaluate "${args.expression}".` };
    }
  },
});

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const model = await getModel();

  // Combine built-in tools with custom tools.
  // Tools are a simple Record<string, ToolDef> — just spread them together.
  const tools = {
    ...createDefaultTools(),
    weather: weatherTool,
    calculator: calculatorTool,
  };

  const agent = createAgent({
    name: "assistant",
    model,
    systemPrompt: [
      "You are a helpful assistant with access to weather data, a calculator, and filesystem tools.",
      "When asked about weather, use the weather tool.",
      "When asked to compute something, use the calculator tool.",
    ].join("\n"),
    tools,
  });

  // Ask something that exercises the custom tools.
  const result = await agent.call(
    "What's the weather like in Tokyo (in celsius)? Also, what's 42 * 17 + 3?",
  );

  console.log("\n--- Response ---");
  console.log(result.text);

  // Show which tools were called.
  // Cast toolCalls for cleaner access — AI SDK v6 uses `input` (not `args`).
  console.log("\n--- Tool calls ---");
  for (const step of result.steps) {
    const calls = step.toolCalls as Array<{ toolName: string; input: unknown }> | undefined;
    if (calls) {
      for (const tc of calls) {
        console.log(`  ${tc.toolName}(${JSON.stringify(tc.input)})`);
      }
    }
  }
}

main().catch(console.error);
