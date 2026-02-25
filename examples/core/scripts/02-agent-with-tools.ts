/**
 * 02 — Agent with Built-in Tools
 *
 * Demonstrates how to give an agent the built-in file-system and shell tools.
 * The agent can read files, search for patterns, and execute commands to
 * answer questions about the local project.
 *
 * Run:
 *   MODEL=openai/gpt-4o bun run examples/02-agent-with-tools.ts
 *
 * Concepts:
 *   - createDefaultTools() — factory that returns all 6 built-in tools
 *   - Passing tools to createAgent via the `tools` config option
 *   - The agent autonomously decides which tools to call
 *   - Tool results are fed back to the LLM for the final answer
 */

import { createAgent, createDefaultTools } from "@comma-agents/core";
import { getModel } from "./helpers";

async function main() {
  const model = await getModel();

  // createDefaultTools() returns: bash, read, write, edit, glob, grep.
  // Each tool is a ToolDef with a Zod schema and an execute function.
  // You can also pass config to customise limits and timeouts:
  //   createDefaultTools({ bash: { defaultTimeout: 60_000 }, read: { defaultLimit: 500 } })
  const tools = createDefaultTools();

  const agent = createAgent({
    name: "explorer",
    model,
    systemPrompt: [
      "You are a helpful assistant that can explore the local filesystem.",
      "Use the available tools to answer questions about the project.",
      "When reading files, always cite the filename.",
    ].join("\n"),
    tools,
    // maxSteps controls how many LLM round-trips (tool calls) the agent
    // can perform per call(). Default is 10 — raise it for complex tasks.
    maxSteps: 15,
  });

  // Ask the agent something that requires tool use.
  // It will autonomously call glob/read/grep to find the answer.
  const result = await agent.call(
    "What is the name and version of this project? Look at the package.json file in the project root (two levels up from this examples directory).",
  );

  console.log("\n--- Response ---");
  console.log(result.text);

  // Inspect which tools were called during the interaction.
  // Each step may contain toolCalls with toolName and input (parsed args).
  // Note: AI SDK v6 uses `input` (not `args`) on tool call objects.
  console.log("\n--- Steps ---");
  for (const step of result.steps) {
    const calls = step.toolCalls as Array<{ toolName: string; input: unknown }> | undefined;
    if (calls && calls.length > 0) {
      for (const tc of calls) {
        console.log(`  Tool: ${tc.toolName}(${JSON.stringify(tc.input).slice(0, 80)}...)`);
      }
    }
  }

  console.log(`\nTotal steps: ${result.steps.length}`);
}

main().catch(console.error);
