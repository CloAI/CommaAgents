/**
 * Core Example Runner
 *
 * Shared entry point for running any core example strategy.
 *
 * Usage:
 *   bun run example <alias>
 *   bun run example --list
 *
 * Loads the strategy file, validates it, instantiates agents + flows,
 * and executes the entry flow via loadStrategy().
 *
 * Provider setup:
 *   Requires the appropriate @ai-sdk/* provider packages to be installed.
 *   API keys should be set via environment variables (e.g. OPENAI_API_KEY).
 */

import path from "node:path";
import * as readline from "node:readline";

import { loadStrategy } from "@comma-agents/core";

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
  code_review: {
    path: "code-review/strategy.json",
    description: "Sequential pipeline: analyzer identifies issues, reviewer suggests fixes",
  },
  research_team: {
    path: "research-team/strategy.yaml",
    description: "Broadcast flow: technical, business, and risk researchers analyze in parallel",
  },
  iterative_refinement: {
    path: "iterative-refinement/strategy.json",
    description: "Cycle flow: writer and critic iterate until content is approved",
  },
  tool_agent: {
    path: "tool-agent/strategy.yaml",
    description: "Single agent with built-in tools (read, glob, grep) for codebase exploration",
  },
};

// ---------------------------------------------------------------------------
// CLI argument handling
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Provider setup
// ---------------------------------------------------------------------------

/**
 * Dynamically resolve provider factories based on what the strategy file
 * references. For now we support openai and anthropic — add more as needed.
 *
 * Each provider package must be installed separately:
 *   bun add @ai-sdk/openai
 *   bun add @ai-sdk/anthropic
 */
async function resolveProviders(): Promise<
  Record<string, (modelID: string) => import("ai").LanguageModel>
> {
  const providers: Record<
    string,
    (modelID: string) => import("ai").LanguageModel
  > = {};

  // Try loading common providers — failures are fine, the loader will
  // throw a clear error if the strategy references a missing provider.
  try {
    const { openai } = await import("@ai-sdk/openai");
    providers.openai = (id: string) => openai(id);
  } catch {
    // @ai-sdk/openai not installed — skip
  }

  try {
    const { anthropic } = await import("@ai-sdk/anthropic");
    providers.anthropic = (id: string) => anthropic(id);
  } catch {
    // @ai-sdk/anthropic not installed — skip
  }

  return providers;
}

// ---------------------------------------------------------------------------
// Simple terminal input collector for user agents
// ---------------------------------------------------------------------------

function createTerminalInputCollector(): (prompt?: string) => Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return (prompt?: string) =>
    new Promise<string>((resolve) => {
      rl.question(prompt ?? "> ", (answer) => {
        resolve(answer);
      });
    });
}

// ---------------------------------------------------------------------------
// Load and execute
// ---------------------------------------------------------------------------

const providers = await resolveProviders();

if (Object.keys(providers).length === 0) {
  console.error(
    "No AI provider packages found. Install at least one, e.g.:\n  bun add @ai-sdk/openai",
  );
  process.exit(1);
}

console.log(`Loading strategy: ${strategyPath}\n`);

const strategy = await loadStrategy(strategyPath, {
  providers,
  inputCollector: createTerminalInputCollector(),
});

console.log(`Strategy: ${strategy.name} (v${strategy.version})`);
if (strategy.description) {
  console.log(`${strategy.description}`);
}
console.log(`Agents: ${Object.keys(strategy.agents).length}`);
console.log(`Entry flow: ${strategy.flow.name}\n`);

console.log("Running strategy...\n");

const result = await strategy.flow.call("Start");

console.log("\n--- Result ---");
console.log(typeof result === "string" ? result : JSON.stringify(result, null, 2));
