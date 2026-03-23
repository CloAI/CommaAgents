/**
 * Example 07 — Broadcast Flow
 *
 * Demonstrates createBroadcastFlow() which sends the same input to
 * multiple agents and collects all results.
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
 *   - The flow result is the combined output (joined with separator)
 *   - debugAgent() / debugFlow() from @comma-agents/debug for verbose logging
 */

import { createAgent, createBroadcastFlow } from "@comma-agents/core";
import { debugAgent, debugFlow } from "@comma-agents/debug";
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
  debugAgent(historian);

  const scientist = createAgent({
    name: "scientist",
    model,
    systemPrompt:
      "You are a scientist. Answer the question from a scientific perspective in 2-3 sentences.",
  });
  debugAgent(scientist);

  const philosopher = createAgent({
    name: "philosopher",
    model,
    systemPrompt:
      "You are a philosopher. Answer the question from a philosophical perspective in 2-3 sentences.",
  });
  debugAgent(philosopher);

  // --- Create the broadcast flow ---
  // debugFlow replaces the manual FlowHooks — it hooks beforeStep/afterStep
  // automatically and logs step names, previews, and token usage.
  const multiPerspective = createBroadcastFlow({
    name: "multi-perspective",
    steps: [historian, scientist, philosopher],
  });
  debugFlow(multiPerspective);

  const question = "Why do humans explore space?";
  console.log(`Question: ${question}\n`);
  console.log("Broadcasting to all agents...\n");

  const result = await multiPerspective.call(question);

  console.log("\n--- Combined Result ---");
  console.log(result.text);
  console.log(
    `\nTotal tokens: ${result.usage.promptTokens} prompt + ${result.usage.completionTokens} completion`,
  );
}

main().catch(console.error);
