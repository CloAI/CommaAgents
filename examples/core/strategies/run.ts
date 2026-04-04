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
 * Model resolution happens automatically via the global provider system.
 * API keys are resolved via the credential store (env vars first, then
 * stored credentials from ~/.local/share/comma-agents/credentials.json).
 * Ensure the appropriate @ai-sdk/* provider packages are installed.
 */

import path from "node:path";
import * as readline from "node:readline";

import { type InputRequest, loadStrategy } from "@comma-agents/core";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";

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
// CLI argument handling via yargs
// ---------------------------------------------------------------------------

const argv = yargs(hideBin(process.argv))
  .scriptName("example")
  .usage("$0 <alias>")
  .command("$0 [alias]", "Run an example strategy", (y) =>
    y.positional("alias", {
      type: "string",
      describe: "Example alias to run",
    }),
  )
  .option("list", {
    alias: "l",
    type: "boolean",
    default: false,
    describe: "List available examples",
  })
  .example("$0 q_a_strategy", "Run the Q&A strategy example")
  .example("$0 --list", "List all available examples")
  .strict()
  .help()
  .alias("h", "help")
  .version(false)
  .parseSync();

if (argv.list || !argv.alias) {
  console.log("Available examples:\n");
  for (const [name, entry] of Object.entries(EXAMPLES)) {
    console.log(`  ${name}`);
    console.log(`    ${entry.description}\n`);
  }
  console.log("Usage: bun run example <alias>");
  if (!argv.alias) process.exit(1);
  process.exit(0);
}

const alias = argv.alias as string;
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
// Simple terminal input collector for user agents
// ---------------------------------------------------------------------------

function createTerminalInputCollector(): (request: InputRequest) => Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return (request: InputRequest) =>
    new Promise<string>((resolve) => {
      rl.question(request.prompt ?? "> ", (answer) => {
        resolve(answer);
      });
    });
}

// ---------------------------------------------------------------------------
// Load and execute
// ---------------------------------------------------------------------------

console.log(`Loading strategy: ${strategyPath}\n`);

const strategy = await loadStrategy(strategyPath, {
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
