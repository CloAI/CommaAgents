/**
 * Example 13 — Abort / Cancellation
 *
 * Demonstrates using the per-call `.abort()` method to cancel agent execution.
 * This is important for:
 *   - Timeout enforcement
 *   - User-initiated cancellation (e.g., "Stop" button in a UI)
 *   - Resource cleanup when a parent operation is cancelled
 *
 * `agent.call()` returns an `AbortablePromise` with an `.abort()` method.
 * `agent.stream()` returns an `AbortableAsyncGenerator` with an `.abort()` method.
 *
 * When aborted, the operation throws an AbortError (DOMException
 * with name "AbortError") that can be caught and handled gracefully.
 *
 * Run:
 *   MODEL=openai/gpt-4o bun run examples/13-abort-cancellation.ts
 *
 * Concepts:
 *   - AbortablePromise from agent.call()
 *   - AbortableAsyncGenerator from agent.stream()
 *   - Timeout-based cancellation
 *   - Error handling for AbortError
 */

import { createAgent } from "@comma-agents/core";
import { getModelString } from "./helpers";

async function main() {
  const model = getModelString();

  // -----------------------------------------------------------------------
  // 1. Timeout-based cancellation with call()
  // -----------------------------------------------------------------------

  console.log("--- 1. Timeout Cancellation (call) ---\n");

  const agent = createAgent({
    name: "storyteller",
    model,
    systemPrompt: "You are a storyteller. Write a very long, detailed story.",
  });

  // call() returns an AbortablePromise with an .abort() method
  const pending = agent.call("Tell me an epic story about a dragon");

  // Set a timeout to abort after 2 seconds
  const timer = setTimeout(() => {
    console.log("\n  [Cancelling after 2 seconds...]");
    pending.abort();
  }, 2000);

  try {
    const result = await pending;
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
  // 2. Stream cancellation with stream()
  // -----------------------------------------------------------------------

  console.log("\n--- 2. Stream Cancellation ---\n");

  const streamAgent = createAgent({
    name: "writer",
    model,
    systemPrompt: "You write detailed technical documentation. Be thorough.",
  });

  // stream() returns an AbortableAsyncGenerator with an .abort() method
  const stream = streamAgent.stream?.("Document the WebSocket protocol");

  // Cancel after 2 seconds
  const streamTimer = setTimeout(() => {
    console.log("\n  [Cancelling stream after 2 seconds...]");
    stream.abort();
  }, 2000);

  try {
    for await (const event of stream) {
      if (event.type === "text") {
        process.stdout.write(event.text);
      }
    }
    clearTimeout(streamTimer);
  } catch (err: unknown) {
    clearTimeout(streamTimer);
    if (err instanceof DOMException && err.name === "AbortError") {
      console.log("\n  Stream was successfully aborted.");
    } else {
      throw err;
    }
  }

  // -----------------------------------------------------------------------
  // 3. Immediate abort (call abort before awaiting)
  // -----------------------------------------------------------------------

  console.log("\n--- 3. Immediate Abort ---\n");

  const doomed = createAgent({
    name: "doomed",
    model,
    systemPrompt: "You will never run.",
  });

  const doomedCall = doomed.call("Hello?");
  doomedCall.abort(); // Abort immediately

  try {
    await doomedCall;
  } catch (err: unknown) {
    if (err instanceof DOMException && err.name === "AbortError") {
      console.log(
        "  Agent rejected immediately — aborted before execution could start.",
      );
    } else {
      throw err;
    }
  }
}

main().catch(console.error);
