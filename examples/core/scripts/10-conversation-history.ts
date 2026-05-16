/**
 * Example 10 — Conversation Context
 *
 * Demonstrates multi-turn conversations with agents. By default, agents
 * maintain conversation context across calls — each call adds the
 * user message and assistant response to the context.
 *
 * This example shows:
 *   - Multi-turn conversation with context retention
 *   - agent.reset() to clear context
 *   - How context accumulates and affects responses
 *
 * Run:
 *   MODEL=openai/gpt-4o bun run examples/10-conversation-history.ts
 *
 * Concepts:
 *   - Agent conversation context (automatic)
 *   - Multi-turn dialogue
 *   - agent.reset() to clear context and start fresh
 *   - Token usage growth over turns (context accumulation)
 */

import { createAgent } from "@comma-agents/core";
import { getModelString } from "./helpers";

async function main() {
  const model = getModelString();

  const agent = createAgent({
    name: "tutor",
    model,
    systemPrompt:
      "You are a patient tutor. Answer questions concisely (2-3 sentences). " +
      "Remember previous context from our conversation.",
  });

  // --- Turn 1: introduce a topic ---
  console.log("--- Turn 1 ---");
  console.log("User: What is a binary tree?");
  const r1 = await agent.call("What is a binary tree?");
  console.log(`Tutor: ${r1.text}`);
  console.log(
    `  (tokens: ${r1.usage.promptTokens} prompt, ${r1.usage.completionTokens} completion)\n`,
  );

  // --- Turn 2: follow-up that requires context from turn 1 ---
  console.log("--- Turn 2 ---");
  console.log(
    "User: What is the difference between a balanced and unbalanced one?",
  );
  const r2 = await agent.call(
    "What is the difference between a balanced and unbalanced one?",
  );
  console.log(`Tutor: ${r2.text}`);
  console.log(
    `  (tokens: ${r2.usage.promptTokens} prompt, ${r2.usage.completionTokens} completion)\n`,
  );

  // --- Turn 3: another follow-up ---
  console.log("--- Turn 3 ---");
  console.log("User: Give me a real-world use case for the balanced variant.");
  const r3 = await agent.call(
    "Give me a real-world use case for the balanced variant.",
  );
  console.log(`Tutor: ${r3.text}`);
  console.log(
    `  (tokens: ${r3.usage.promptTokens} prompt, ${r3.usage.completionTokens} completion)\n`,
  );

  // Note: prompt tokens grow with each turn because context is included

  // --- Reset context ---
  console.log("--- Resetting conversation context ---\n");
  agent.reset();

  // --- Turn 4: after reset, context is lost ---
  console.log("--- Turn 4 (after reset) ---");
  console.log("User: Can you remind me what we were discussing?");
  const r4 = await agent.call("Can you remind me what we were discussing?");
  console.log(`Tutor: ${r4.text}`);
  console.log(
    `  (tokens: ${r4.usage.promptTokens} prompt, ${r4.usage.completionTokens} completion)`,
  );
  console.log("  (The agent no longer remembers the previous conversation)");
}

main().catch(console.error);
