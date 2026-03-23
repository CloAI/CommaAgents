/**
 * Example 13 — Abort / Cancellation
 *
 * Demonstrates using AbortController to cancel agent execution.
 * This is important for:
 *   - Timeout enforcement
 *   - User-initiated cancellation (e.g., "Stop" button in a UI)
 *   - Resource cleanup when a parent operation is cancelled
 *
 * When an agent is aborted, it throws an AbortError (DOMException
 * with name "AbortError") that can be caught and handled gracefully.
 *
 * Run:
 *   MODEL=openai/gpt-4o bun run examples/13-abort-cancellation.ts
 *
 * Concepts:
 *   - AbortController / AbortSignal with createAgent()
 *   - Timeout-based cancellation
 *   - Error handling for AbortError
 *   - Cancelling flows mid-execution
 */

import { createAgent, createSequentialFlow } from "@comma-agents/core";
import { getModel } from "./helpers";

async function main() {
  const model = await getModel();

  // -----------------------------------------------------------------------
  // 1. Timeout-based cancellation
  // -----------------------------------------------------------------------

  console.log("--- 1. Timeout Cancellation ---\n");

  const controller = new AbortController();

  const agent = createAgent({
    name: "storyteller",
    model,
    systemPrompt: "You are a storyteller. Write a very long, detailed story.",
    abort: controller.signal,
  });

  // Set a timeout to abort after 2 seconds
  const timer = setTimeout(() => {
    console.log("\n  [Cancelling after 2 seconds...]");
    controller.abort();
  }, 2000);

  try {
    // This will be aborted after ~2 seconds
    const result = await agent.call("Tell me an epic story about a dragon");
    clearTimeout(timer);
    console.log(`Result: ${result.text.slice(0, 200)}...`);
  } catch (err: unknown) {
    clearTimeout(timer);
    if (err instanceof DOMException && err.name === "AbortError") {
      console.log("  Agent was successfully aborted (AbortError caught).");
      console.log(`  Error message: ${err.message}`);
    } else {
      throw err; // Re-throw unexpected errors
    }
  }

  // -----------------------------------------------------------------------
  // 2. Manual cancellation of a flow
  // -----------------------------------------------------------------------

  console.log("\n--- 2. Flow Cancellation ---\n");

  const flowController = new AbortController();

  const writer = createAgent({
    name: "writer",
    model,
    systemPrompt: "You write detailed technical documentation. Be thorough.",
    abort: flowController.signal,
  });

  const reviewer = createAgent({
    name: "reviewer",
    model,
    systemPrompt: "You review technical documentation and suggest improvements.",
    abort: flowController.signal,
  });

  const pipeline = createSequentialFlow({
    name: "doc-pipeline",
    steps: [writer, reviewer],
  });

  // Cancel after the first agent completes (during reviewer execution)
  // In practice, this would be triggered by a UI event or external signal
  const flowTimer = setTimeout(() => {
    console.log("  [Cancelling flow mid-execution...]");
    flowController.abort();
  }, 3000);

  try {
    const result = await pipeline.call("Document the WebSocket protocol");
    clearTimeout(flowTimer);
    console.log(`Result: ${result.text.slice(0, 200)}...`);
  } catch (err: unknown) {
    clearTimeout(flowTimer);
    if (err instanceof DOMException && err.name === "AbortError") {
      console.log("  Flow was successfully aborted.");
      console.log("  Partial work is discarded — the flow did not complete.");
    } else {
      throw err;
    }
  }

  // -----------------------------------------------------------------------
  // 3. Pre-cancelled signal (immediate rejection)
  // -----------------------------------------------------------------------

  console.log("\n--- 3. Pre-cancelled Signal ---\n");

  const alreadyCancelled = new AbortController();
  alreadyCancelled.abort(); // Already aborted before agent runs

  const doomed = createAgent({
    name: "doomed",
    model,
    systemPrompt: "You will never run.",
    abort: alreadyCancelled.signal,
  });

  try {
    await doomed.call("Hello?");
  } catch (err: unknown) {
    if (err instanceof DOMException && err.name === "AbortError") {
      console.log("  Agent rejected immediately — signal was already aborted.");
    } else {
      throw err;
    }
  }
}

main().catch(console.error);
