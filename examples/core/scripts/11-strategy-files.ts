/**
 * Example 11 — Strategy Files
 *
 * Demonstrates loading and running strategies from JSON and YAML files
 * using loadStrategy() and loadStrategyFromString().
 *
 * Strategy files are declarative definitions of agent pipelines:
 *   - Agents with their models, system prompts, and tools
 *   - Flow structure (sequential, cycle, broadcast)
 *
 * Model and tool resolution happens automatically via global registries.
 * The model strings in strategy files (e.g. "openai/gpt-4o") are resolved
 * internally by createAgent() using the global credential store and
 * provider system. Just ensure the corresponding env var is set
 * (e.g. OPENAI_API_KEY) and the provider package is installed.
 *
 * This example:
 *   1. Loads a JSON strategy from a string
 *   2. Loads a YAML strategy from a string
 *   3. Demonstrates strategy export (JSON ↔ YAML roundtrip)
 *
 * Run:
 *   OPENAI_API_KEY=sk-... bun run examples/11-strategy-files.ts
 *
 * Concepts:
 *   - loadStrategyFromString(content, format, options) — load from string
 *   - exportStrategy(strategy) — serialize back to JSON/YAML
 *   - Model strings in strategy files (e.g. "openai/gpt-4o")
 *   - Automatic model resolution via global registries
 */

import { exportStrategy, loadStrategyFromString } from "@comma-agents/core";
import { getModelString } from "./helpers";

async function main() {
  const modelString = getModelString();

  // -----------------------------------------------------------------------
  // 1. Load a JSON strategy from a string
  // -----------------------------------------------------------------------

  // Strategy files reference models as "provider/model" strings.
  // These are resolved automatically by the global provider system —
  // no manual provider factories needed.
  const jsonStrategy = JSON.stringify({
    name: "Code Review Pipeline",
    version: "1.0",
    description: "A sequential pipeline for code review.",
    agents: {
      analyzer: {
        model: modelString,
        systemPrompt:
          "You analyze code for potential issues. Be concise (2-3 bullet points).",
      },
      reviewer: {
        model: modelString,
        systemPrompt:
          "You review the analysis and suggest improvements. Be concise (2-3 bullet points).",
      },
    },
    flow: {
      name: "Review Pipeline",
      type: "sequential",
      steps: [{ agent: "analyzer" }, { agent: "reviewer" }],
    },
  });

  console.log("--- Loading JSON strategy ---");
  const loaded = await loadStrategyFromString(jsonStrategy, "json");
  console.log(`Strategy: ${loaded.name} (v${loaded.version})`);
  console.log(`Agents: ${Object.keys(loaded.agents).join(", ")}`);
  console.log(`Flow: ${loaded.flow.name}\n`);

  console.log("Running strategy...\n");
  const result = await loaded.flow.call(
    "Review this function: function add(a, b) { return a + b; }",
  );
  console.log("--- Result ---");
  console.log(result.text);

  // -----------------------------------------------------------------------
  // 2. Load a YAML strategy from a string
  // -----------------------------------------------------------------------

  const yamlStrategy = `
name: Brainstorm Session
version: "1.0"
description: Parallel brainstorming with multiple perspectives.
agents:
  optimist:
    model: ${modelString}
    systemPrompt: >
      You are an optimist. Find 2 positive aspects of the idea.
      Be concise.
  critic:
    model: ${modelString}
    systemPrompt: >
      You are a critic. Find 2 potential problems with the idea.
      Be concise.
flow:
  name: Brainstorm
  type: broadcast
  steps:
    - agent: optimist
    - agent: critic
`;

  console.log("\n--- Loading YAML strategy ---");
  const yamlLoaded = await loadStrategyFromString(yamlStrategy.trim(), "yaml");
  console.log(`Strategy: ${yamlLoaded.name}`);
  console.log(`Agents: ${Object.keys(yamlLoaded.agents).join(", ")}`);
  console.log(`Flow: ${yamlLoaded.flow.name}\n`);

  console.log("Running strategy...\n");
  const yamlResult = await yamlLoaded.flow.call(
    "Building a social media app for pets",
  );
  console.log("--- Result ---");
  console.log(yamlResult.text);

  // -----------------------------------------------------------------------
  // 3. Export strategy (roundtrip)
  // -----------------------------------------------------------------------

  console.log("\n--- Exporting strategy back to JSON ---");
  const exportedJson = exportStrategy(loaded);
  console.log(JSON.stringify(JSON.parse(exportedJson), null, 2));

  console.log("\n--- Exporting strategy to YAML ---");
  const exportedYaml = exportStrategy(loaded, { format: "yaml" });
  console.log(exportedYaml);
}

main().catch(console.error);
