/**
 * Example 08 — Nested Flows
 *
 * Demonstrates composing flows within flows. Since every flow implements
 * the Agent interface, a flow can be used as a step in another flow.
 *
 * This example builds a two-level architecture:
 *   Inner flow: writer → reviewer (sequential)
 *   Outer flow: inner flow → editor (sequential)
 *
 * The inner flow produces and reviews content, then the outer flow
 * passes the reviewed content to an editor for final polish.
 *
 * Run:
 *   MODEL=openai/gpt-4o bun run examples/08-nested-flows.ts
 *
 * Concepts:
 *   - Flows implement the Agent interface (composable)
 *   - Using a flow as a step in another flow
 *   - Building hierarchical agent pipelines
 *   - debugAgent() / debugFlow() from @comma-agents/debug for verbose logging
 */

import { createAgent, createSequentialFlow } from "@comma-agents/core";
import { debugAgent, debugFlow } from "@comma-agents/debug";
import { getModel } from "./helpers";

async function main() {
  const model = await getModel();

  // --- Inner flow agents ---
  const writer = createAgent({
    name: "writer",
    model,
    systemPrompt:
      "You are a technical writer. Write a clear, concise explanation of the given topic in 3-4 sentences.",
  });
  debugAgent(writer);

  const reviewer = createAgent({
    name: "reviewer",
    model,
    systemPrompt:
      "You are a technical reviewer. Read the explanation and provide a revised version " +
      "that improves clarity and accuracy. Output only the revised text.",
  });
  debugAgent(reviewer);

  // --- Inner flow: write + review ---
  const writeAndReview = createSequentialFlow({
    name: "write-and-review",
    steps: [writer, reviewer],
  });
  debugFlow(writeAndReview);

  // --- Outer flow agent ---
  const editor = createAgent({
    name: "editor",
    model,
    systemPrompt:
      "You are an editor. Take the reviewed text and add a catchy one-line title, " +
      "then format it nicely. Output the title on the first line, then a blank line, " +
      "then the polished text.",
  });
  debugAgent(editor);

  // --- Outer flow: (write+review) → edit ---
  // Note: writeAndReview is a flow, but it satisfies the Agent interface,
  // so it can be used as a step just like any agent.
  const fullPipeline = createSequentialFlow({
    name: "full-pipeline",
    steps: [writeAndReview, editor],
  });
  debugFlow(fullPipeline);

  console.log("Running nested pipeline: (writer → reviewer) → editor\n");

  const result = await fullPipeline.call("Explain how WebSockets work");

  console.log("--- Final Output ---");
  console.log(result.text);
  console.log(
    `\nTotal tokens: ${result.usage.promptTokens} prompt + ${result.usage.completionTokens} completion`,
  );
}

main().catch(console.error);
