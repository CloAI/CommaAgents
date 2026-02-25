/**
 * Example 07 — Broadcast Flow
 *
 * Demonstrates createBroadcastFlow() which sends the same input to
 * multiple agents in parallel and collects all results.
 *
 * This is useful for:
 *   - Getting multiple perspectives on the same question
 *   - Running independent analyses concurrently
 *   - Voting/consensus mechanisms (pick the best answer)
 *
 * Run:
 *   MODEL=openai/gpt-4o bun run examples/07-broadcast-flow.ts
 *
 * Concepts:
 *   - createBroadcastFlow() for parallel agent execution
 *   - All agents receive the same input simultaneously
 *   - The flow result is the combined output (last agent's text by default)
 *   - FlowHooks for observing each parallel step
 */

import type { FlowHooks } from "@comma-agents/core";
import { createAgent, createBroadcastFlow } from "@comma-agents/core";
import { getModel } from "./helpers";

async function main() {
  const model = await getModel();

  // --- Three agents with different expertise ---
  const historian = createAgent({
    name: "historian",
    model,
    systemPrompt:
      "You are a historian. Answer the question from a historical perspective in 2-3 sentences.",
  });

  const scientist = createAgent({
    name: "scientist",
    model,
    systemPrompt:
      "You are a scientist. Answer the question from a scientific perspective in 2-3 sentences.",
  });

  const philosopher = createAgent({
    name: "philosopher",
    model,
    systemPrompt:
      "You are a philosopher. Answer the question from a philosophical perspective in 2-3 sentences.",
  });

  // --- Flow hooks for observing parallel execution ---
  const flowHooks: FlowHooks = {
    beforeStep: [
      (ctx) => {
        console.log(`  [Broadcast] Starting: ${ctx.stepName}`);
      },
    ],
    afterStep: [
      (ctx) => {
        console.log(`  [Broadcast] Completed: ${ctx.stepName} (${ctx.result.text.length} chars)`);
      },
    ],
  };

  // --- Create the broadcast flow ---
  const multiPerspective = createBroadcastFlow({
    name: "multi-perspective",
    steps: [{ agent: historian }, { agent: scientist }, { agent: philosopher }],
    hooks: flowHooks,
  });

  const question = "Why do humans explore space?";
  console.log(`Question: ${question}\n`);
  console.log("Broadcasting to all agents in parallel...\n");

  const result = await multiPerspective.call(question);

  console.log("\n--- Combined Result ---");
  console.log(result.text);
  console.log(
    `\nTotal tokens: ${result.usage.promptTokens} prompt + ${result.usage.completionTokens} completion`,
  );
}

main().catch(console.error);
