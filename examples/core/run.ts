/**
 * Core Example Runner
 *
 * Shared entry point for running any core example strategy.
 *
 * Usage:
 *   bun run example <alias>
 *   bun run example --list
 *
 * Once the strategy loader (Phase 7) is implemented, this will
 * use loadStrategy() to parse, validate, and execute the strategy.
 */

import path from "node:path";

const EXAMPLES_DIR = path.dirname(new URL(import.meta.url).pathname);

/**
 * Registry of example aliases to their strategy file paths.
 * Add new examples here as they are created.
 */
const EXAMPLES: Record<string, { path: string; description: string }> = {
  q_a_strategy: {
    path: "simple/strategy.json",
    description: "Minimal Q&A -- user asks a question, an LLM agent answers",
  },
};

const alias = process.argv[2];

if (!alias || alias === "--list") {
  console.log("Available examples:\n");
  for (const [name, entry] of Object.entries(EXAMPLES)) {
    console.log(`  ${name}`);
    console.log(`    ${entry.description}\n`);
  }
  console.log("Usage: bun run example <alias>");
  if (!alias) process.exit(1);
  process.exit(0);
}

const entry = EXAMPLES[alias];

if (!entry) {
  console.error(`Unknown example: "${alias}"\n`);
  console.error("Available examples:");
  for (const name of Object.keys(EXAMPLES)) {
    console.error(`  ${name}`);
  }
  process.exit(1);
}

const strategyPath = path.resolve(EXAMPLES_DIR, entry.path);
const file = Bun.file(strategyPath);

if (!(await file.exists())) {
  console.error(`Strategy file not found: ${strategyPath}`);
  process.exit(1);
}

const strategy = await file.json();

console.log(`Strategy: ${strategy.name} (v${strategy.version})`);
console.log(`${strategy.description}\n`);

console.log(`Flows: ${strategy.flows.length}`);

for (const flow of strategy.flows) {
  console.log(`  - ${flow.name} (${flow.type}, ${flow.steps.length} steps)`);
  for (const step of flow.steps) {
    const detail =
      step.agent?.type === "user"
        ? "user input"
        : step.agent?.model ?? step.type;
    console.log(`    - ${step.name}: ${detail}`);
  }
}

// TODO: Replace with actual strategy execution once Phase 7 lands:
//   import { loadStrategy } from "@comma-agents/core";
//   const flow = loadStrategy(strategyPath);
//   await flow.run();
console.log(
  "\nNote: Strategy execution is not yet implemented (Phase 7).",
  "\nThis runner validates that the strategy JSON is well-formed.",
);
