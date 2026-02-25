/**
 * Example 12 — Streaming
 *
 * Demonstrates streaming responses from agents using agent.stream().
 * Instead of waiting for the complete response, streaming delivers
 * tokens as they are generated — useful for real-time UIs.
 *
 * The stream yields AgentStreamEvent objects:
 *   - { type: "text", text } — a text chunk
 *   - { type: "tool-call", toolName, args } — agent is calling a tool
 *   - { type: "tool-result", toolName, output } — tool returned a result
 *   - { type: "step-start" } — a new generation step started
 *   - { type: "done", result } — generation complete with final result
 *
 * Run:
 *   MODEL=openai/gpt-4o bun run examples/12-streaming.ts
 *
 * Concepts:
 *   - agent.stream(message) for streaming responses
 *   - AgentStreamEvent types
 *   - Real-time token display
 *   - Collecting the final result from the "done" event
 */

import type { AgentStreamEvent } from "@comma-agents/core";
import { createAgent, createDefaultTools } from "@comma-agents/core";
import { getModel } from "./helpers";

async function main() {
  const model = await getModel();

  // --- Simple streaming: text only ---
  console.log("--- 1. Simple Streaming ---\n");

  const agent = createAgent({
    name: "writer",
    model,
    systemPrompt: "You are a creative writer. Write short, vivid descriptions.",
  });

  console.log("Streaming response:");
  process.stdout.write("  ");

  const stream = agent.stream("Describe a sunset over the ocean in 3 sentences.");

  let finalResult: any = null;
  for await (const event of stream) {
    switch (event.type) {
      case "text":
        process.stdout.write(event.text);
        break;
      case "done":
        finalResult = event.result;
        break;
    }
  }

  console.log("\n");
  if (finalResult) {
    console.log(
      `Tokens: ${finalResult.usage.promptTokens} prompt + ${finalResult.usage.completionTokens} completion`,
    );
  }

  // --- Streaming with tools ---
  console.log("\n--- 2. Streaming with Tools ---\n");

  const tools = createDefaultTools({ allowedDirectories: [process.cwd()] });
  const toolAgent = createAgent({
    name: "explorer",
    model,
    systemPrompt: "You are a file explorer. Use tools to answer questions about the project.",
    tools,
    maxSteps: 3,
  });

  console.log("Streaming response with tool calls:");
  const toolStream = toolAgent.stream("What files are in the current directory? List the first 5.");

  for await (const event of toolStream) {
    switch (event.type) {
      case "text":
        process.stdout.write(event.text);
        break;
      case "tool-call":
        console.log(`\n  [Tool Call] ${event.toolName}(${JSON.stringify(event.args)})`);
        break;
      case "tool-result":
        console.log(`  [Tool Result] ${event.toolName}: ${String(event.output).slice(0, 100)}...`);
        break;
      case "step-start":
        console.log("  [New Step]");
        break;
      case "done":
        console.log(
          `\n\nTokens: ${event.result.usage.promptTokens} prompt + ${event.result.usage.completionTokens} completion`,
        );
        break;
    }
  }
}

main().catch(console.error);
