/**
 * 01 — Basic Agent
 *
 * The simplest possible @comma-agents/core example.
 * Creates an agent with a system prompt, sends a single message, and prints
 * the response along with token usage.
 *
 * Run:
 *   MODEL=openai/gpt-4o bun run examples/01-basic-agent.ts
 *
 * Concepts:
 *   - createAgent()  — the primary agent factory
 *   - AgentConfig    — name, model (string), systemPrompt
 *   - agent.call()   — send a message and await the full response
 *   - AgentCallResult — text, usage, finishReason
 */

import { createAgent } from "@comma-agents/core";
import { getModelString } from "./helpers";

async function main() {
  const model = getModelString();

  // Create an agent with a name, model string, and system prompt.
  // The model string is resolved internally by createAgent() via the
  // global model registry and provider system.
  const agent = createAgent({
    name: "greeter",
    model,
    systemPrompt:
      "You are a friendly assistant. Keep responses concise — one paragraph max.",
  });

  // Send a message and await the complete result.
  const result = await agent.call(
    "What is the Fibonacci sequence? Explain it simply.",
  );

  // The result contains the response text, step details, and token usage.
  console.log("\n--- Response ---");
  console.log(result.text);
  console.log("\n--- Usage ---");
  console.log(`Prompt tokens:     ${result.usage.promptTokens}`);
  console.log(`Completion tokens: ${result.usage.completionTokens}`);
  console.log(`Finish reason:     ${result.finishReason}`);

  // Agents maintain conversation history — a second call sees the first.
  const followUp = await agent.call("Can you give me the first 10 numbers?");

  console.log("\n--- Follow-up ---");
  console.log(followUp.text);

  // Reset clears the conversation history for a fresh start.
  agent.reset();
  console.log("\nHistory cleared.");
}

main().catch(console.error);
