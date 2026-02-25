/**
 * Example 06 — Cycle Flow
 *
 * Demonstrates createCycleFlow() which repeats a pipeline of agents until
 * either a maximum iteration count is reached or a stop condition is met.
 *
 * This is useful for iterative refinement: e.g., a writer produces code,
 * a reviewer critiques it, and the cycle continues until the reviewer
 * approves or max iterations are reached.
 *
 * Run:
 *   MODEL=openai/gpt-4o bun run examples/06-cycle-flow.ts
 *
 * Concepts:
 *   - createCycleFlow() for iterative agent loops
 *   - maxIterations to bound the cycle
 *   - CycleHooks (beforeIteration, afterIteration) for observation
 *   - observer agent that runs each iteration but does not contribute output
 */

import type { CycleHooks } from "@comma-agents/core";
import { createAgent, createCycleFlow } from "@comma-agents/core";
import { getModel } from "./helpers";

async function main() {
  const model = await getModel();

  // --- Writer agent: produces or refines a short poem ---
  const writer = createAgent({
    name: "writer",
    model,
    systemPrompt:
      "You are a creative writer. Write or refine a short 4-line poem based on the given topic or feedback. " +
      "Output only the poem, nothing else.",
  });

  // --- Reviewer agent: critiques the poem ---
  // When satisfied, the reviewer's output contains "APPROVED" which
  // acts as the stop phrase for the cycle.
  const reviewer = createAgent({
    name: "reviewer",
    model,
    systemPrompt:
      "You are a poetry critic. Review the poem and provide brief feedback. " +
      "If the poem is excellent, respond with exactly: APPROVED\n" +
      "Otherwise, give constructive feedback for improvement.",
  });

  // --- Cycle hooks for observability ---
  const cycleHooks: CycleHooks = {
    beforeIteration: [
      (ctx) => {
        console.log(`\n--- Iteration ${ctx.iteration + 1} ---`);
      },
    ],
    afterIteration: [
      (ctx) => {
        console.log(
          `  [Cycle] Iteration ${ctx.iteration + 1} complete, output length: ${ctx.result.text.length}`,
        );
      },
    ],
  };

  // --- Create the cycle flow ---
  const refinementLoop = createCycleFlow({
    name: "poem-refinement",
    steps: [{ agent: writer }, { agent: reviewer }],
    maxIterations: 3,
    stopPhrase: "APPROVED",
    hooks: cycleHooks,
  });

  console.log("Starting poem refinement cycle (max 3 iterations)...\n");

  const result = await refinementLoop.call("Write a poem about the ocean at dawn");

  console.log("\n--- Final Result ---");
  console.log(result.text);
  console.log(
    `\nTotal tokens: ${result.usage.promptTokens} prompt + ${result.usage.completionTokens} completion`,
  );
}

main().catch(console.error);
