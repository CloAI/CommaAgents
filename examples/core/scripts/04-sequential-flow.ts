/**
 * 04 — Sequential Flow (Pipeline)
 *
 * Demonstrates `createSequentialFlow()` to chain multiple agents into a
 * pipeline. Each agent's output becomes the next agent's input.
 *
 * Pipeline:  writer  →  reviewer  →  editor
 *   1. Writer drafts code based on the user's request.
 *   2. Reviewer critiques the code and suggests improvements.
 *   3. Editor applies the feedback and returns the final version.
 *
 * Run:
 *   MODEL=openai/gpt-4o bun run examples/04-sequential-flow.ts
 *
 * Concepts:
 *   - createSequentialFlow()  — create a flow that chains agents in order
 *   - FlowConfig              — name + steps (array of Agent instances)
 *   - A flow implements the Agent interface, so it has .call() and .reset()
 *   - Flows are composable — you can nest flows as steps in other flows
 *   - debugAgent() / debugFlow() from @comma-agents/debug add verbose logging
 */

import type { FlowResult } from "@comma-agents/core";
import { createAgent, createSequentialFlow } from "@comma-agents/core";
import { debugAgent, debugFlow } from "@comma-agents/debug";
import { getModelString } from "./helpers";

async function main() {
  const model = getModelString();

  // --- Step 1: Writer agent ---
  // Generates a first draft of code from the user's request.
  const writer = createAgent({
    name: "writer",
    model,
    systemPrompt: [
      "You are a TypeScript developer. When given a request, write clean,",
      "well-typed TypeScript code. Include brief inline comments.",
      "Output ONLY the code — no explanations, no markdown fences.",
    ].join(" "),
  });
  debugAgent(writer);

  // --- Step 2: Reviewer agent ---
  // Receives the writer's code and provides a critique.
  const reviewer = createAgent({
    name: "reviewer",
    model,
    systemPrompt: [
      "You are a senior code reviewer. You will receive TypeScript code.",
      "Review it for correctness, readability, and best practices.",
      "List specific, actionable improvements. Be concise.",
    ].join(" "),
  });
  debugAgent(reviewer);

  // --- Step 3: Editor agent ---
  // Receives the reviewer's feedback (which includes the original code)
  // and produces the improved final version.
  const editor = createAgent({
    name: "editor",
    model,
    systemPrompt: [
      "You are a code editor. You will receive a code review with feedback.",
      "Apply all suggested improvements and return the final, polished code.",
      "Output ONLY the improved code — no explanations, no markdown fences.",
    ].join(" "),
  });
  debugAgent(editor);

  // --- Create the sequential flow ---
  // The flow chains: writer → reviewer → editor.
  // Each agent's response text is passed as the input to the next agent.
  const pipeline = createSequentialFlow({
    name: "code-review-pipeline",
    steps: [writer, reviewer, editor],
  });
  debugFlow(pipeline);

  // A flow implements the Agent interface, so you call it the same way.
  console.log("Running pipeline: writer → reviewer → editor\n");
  const result = await pipeline.call(
    "Write a TypeScript function called `debounce` that takes a callback and a delay in ms, and returns a debounced version of the callback.",
  );

  console.log("--- Final output (from editor) ---");
  console.log(result.text);

  // Cast to FlowResult to access per-step details.
  const flowResult = result as FlowResult;
  console.log("\n--- Pipeline stats ---");
  console.log(`Total steps: ${flowResult.stepResults.length}`);
  console.log(`Prompt tokens:     ${result.usage.promptTokens}`);
  console.log(`Completion tokens: ${result.usage.completionTokens}`);
}

main().catch(console.error);
