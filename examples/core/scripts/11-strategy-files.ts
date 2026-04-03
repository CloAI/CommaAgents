/**
 * Example 11 — Strategy Files
 *
 * Demonstrates loading and running strategies from JSON and YAML files
 * using loadStrategy() and loadStrategyFromString().
 *
 * Strategy files are declarative definitions of agent pipelines:
 *   - Agents with their models, system prompts, and tools
 *   - Flow structure (sequential, cycle, broadcast)
 *   - Default settings (shared model, tools)
 *
 * This example:
 *   1. Loads a JSON strategy from a file
 *   2. Loads a YAML strategy from a string
 *   3. Shows how to provide model factories (ProviderFactory)
 *   4. Demonstrates strategy export (JSON ↔ YAML roundtrip)
 *
 * Run:
 *   MODEL=openai/gpt-4o bun run examples/11-strategy-files.ts
 *
 * Concepts:
 *   - loadStrategy(path, options) — load from file
 *   - loadStrategyFromString(content, format, options) — load from string
 *   - exportStrategy(strategy) — serialize back to JSON/YAML
 *   - ProviderFactory map for model resolution
 *   - Strategy defaults (shared model across agents)
 */

import { exportStrategy, loadStrategyFromString } from "@comma-agents/core";
import { getModel } from "./helpers";

async function main() {
  const model = await getModel();

  // --- Provider factory ---
  // Strategy files reference models as "provider/model" strings.
  // We need to provide a factory that creates LanguageModel instances.
  // In production, you'd map each provider to its SDK package.
  // For this example, we use a single model for all providers.
  const providers: Record<string, (modelId: string) => import("ai").LanguageModel> = {
    openai: () => model,
    anthropic: () => model,
  };

  // -----------------------------------------------------------------------
  // 1. Load a JSON strategy from a string
  // -----------------------------------------------------------------------

  const jsonStrategy = JSON.stringify({
    name: "Code Review Pipeline",
    version: "1.0",
    description: "A sequential pipeline for code review.",
    defaults: {
      model: "openai/gpt-4o",
    },
    agents: {
      analyzer: {
        systemPrompt: "You analyze code for potential issues. Be concise (2-3 bullet points).",
      },
      reviewer: {
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
  const loaded = await loadStrategyFromString(jsonStrategy, "json", { providers });
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
    model: openai/gpt-4o
    systemPrompt: >
      You are an optimist. Find 2 positive aspects of the idea.
      Be concise.
  critic:
    model: openai/gpt-4o
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
  const yamlLoaded = await loadStrategyFromString(yamlStrategy.trim(), "yaml", { providers });
  console.log(`Strategy: ${yamlLoaded.name}`);
  console.log(`Agents: ${Object.keys(yamlLoaded.agents).join(", ")}`);
  console.log(`Flow: ${yamlLoaded.flow.name}\n`);

  console.log("Running strategy...\n");
  const yamlResult = await yamlLoaded.flow.call("Building a social media app for pets");
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
