/**
 * Example 06 — Cycle Flow
 *
 * Demonstrates createCycleFlow() which repeats a pipeline of agents for
 * a fixed number of cycles (or until an AbortSignal fires).
 *
 * This is useful for iterative refinement: e.g., a writer produces a poem,
 * a reviewer critiques it, and the cycle continues for N iterations.
 * An optional observer agent can inspect each cycle's output.
 *
 * Run:
 *   MODEL=openai/gpt-4o bun run examples/06-cycle-flow.ts
 *
 * Concepts:
 *   - createCycleFlow() for iterative agent loops
 *   - cycles to bound the iteration count
 *   - observer agent that runs after each cycle
 *   - debugAgent() / debugFlow() from @comma-agents/debug for verbose logging
 */

import { createAgent, createCycleFlow } from "@comma-agents/core";
import { debugAgent, debugFlow } from "@comma-agents/debug";
import { getModelString } from "./helpers";

async function main() {
  const model = getModelString();

  // --- Writer agent: produces or refines a short poem ---
  const writer = createAgent({
    name: "writer",
    model,
    systemPrompt:
      "You are a creative writer. Write or refine a short 4-line poem based on the given topic or feedback. " +
      "Output only the poem, nothing else.",
  });
  debugAgent(writer);

  // --- Reviewer agent: critiques the poem ---
  const reviewer = createAgent({
    name: "reviewer",
    model,
    systemPrompt:
      "You are a poetry critic. Review the poem and provide brief feedback for improvement. " +
      "Include the original poem in your response, then your suggestions.",
  });
  debugAgent(reviewer);

  // --- Observer agent: summarises the state of each cycle ---
  // The observer runs after each cycle via the `observer` config option.
  // Its output becomes the input for the next cycle.
  const observer = createAgent({
    name: "observer",
    model,
    systemPrompt:
      "You receive a poetry review. Summarise the feedback into a single directive " +
      "for the writer to follow in the next revision. Keep it to one sentence.",
  });
  debugAgent(observer);

  // --- Create the cycle flow ---
  const refinementLoop = createCycleFlow({
    name: "poem-refinement",
    steps: [writer, reviewer],
    cycles: 3,
    observer,
  });
  debugFlow(refinementLoop);

  console.log("Starting poem refinement cycle (3 iterations)...\n");

  const result = await refinementLoop.call(
    "Write a poem about the ocean at dawn",
  );

  console.log("\n--- Final Result ---");
  console.log(result.text);
  console.log(
    `\nTotal tokens: ${result.usage.promptTokens} prompt + ${result.usage.completionTokens} completion`,
  );
}

main().catch(console.error);
