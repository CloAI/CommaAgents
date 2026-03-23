/**
 * TUI entry point — renders the App component with Ink.
 *
 * Interactive mode (default):
 *   bun run tui/main.tsx
 *
 * Batch mode — run all examples with a specific provider/model:
 *   bun run tui/main.tsx --all --provider openai --model gpt-4o
 *   bun run tui/main.tsx --all -p github-copilot -m gpt-4o
 *
 * Options:
 *   --all              Run all examples sequentially (non-interactive)
 *   --provider, -p     Provider ID (openai, anthropic, github-copilot)
 *   --model, -m        Model ID (e.g. gpt-4o, claude-sonnet-4-5)
 *   --core-only        In batch mode, run only core examples (skip daemon)
 *   --daemon-only      In batch mode, run only daemon examples (skip core)
 */

import { render } from "ink";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import type { CLIArgs } from "./App";
import { App } from "./App";

const argv = yargs(hideBin(process.argv))
  .scriptName("comma-agents-tui")
  .usage("$0 [options]")
  .option("all", {
    type: "boolean",
    default: false,
    describe: "Run all examples sequentially (non-interactive)",
  })
  .option("provider", {
    alias: "p",
    type: "string",
    describe: "Provider ID (openai, anthropic, github-copilot)",
  })
  .option("model", {
    alias: "m",
    type: "string",
    describe: "Model ID (e.g. gpt-4o, claude-sonnet-4-5)",
  })
  .option("core-only", {
    type: "boolean",
    default: false,
    describe: "In batch mode, run only core examples (skip daemon)",
  })
  .option("daemon-only", {
    type: "boolean",
    default: false,
    describe: "In batch mode, run only daemon examples (skip core)",
  })
  .check((argv) => {
    if (argv.all && !argv.provider) {
      throw new Error("--all requires --provider (-p) to be specified.");
    }
    return true;
  })
  .example("$0", "Interactive TUI")
  .example("$0 --all -p openai", "Run all examples with OpenAI")
  .example("$0 --all -p github-copilot -m gpt-4o", "Run all with Copilot")
  .strict()
  .help()
  .alias("h", "help")
  .version(false)
  .parseSync();

const cliArgs: CLIArgs | undefined = argv.all
  ? {
      provider: argv.provider ?? "",
      model: argv.model,
      coreOnly: argv.coreOnly ?? false,
      daemonOnly: argv.daemonOnly ?? false,
    }
  : undefined;

render(<App cliArgs={cliArgs} />);
