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

import { parseArgs } from "node:util";
import { render } from "ink";
import type { CLIArgs } from "./App";
import { App } from "./App";

const { values } = parseArgs({
  options: {
    all: { type: "boolean", default: false },
    provider: { type: "string", short: "p" },
    model: { type: "string", short: "m" },
    "core-only": { type: "boolean", default: false },
    "daemon-only": { type: "boolean", default: false },
    help: { type: "boolean", short: "h", default: false },
  },
  strict: true,
  allowPositionals: false,
});

if (values.help) {
  console.log(`
comma-agents Example Runner

Usage:
  bun run tui/main.tsx                       Interactive TUI
  bun run tui/main.tsx --all -p openai       Run all examples with OpenAI
  bun run tui/main.tsx --all -p github-copilot -m gpt-4o

Options:
  --all              Run all examples sequentially (non-interactive)
  --provider, -p     Provider ID (openai, anthropic, github-copilot)
  --model, -m        Model ID (defaults to provider's default model)
  --core-only        In batch mode, run only core examples (skip daemon)
  --daemon-only      In batch mode, run only daemon examples (skip core)
  -h, --help         Show this help message
`);
  process.exit(0);
}

if (values.all && !values.provider) {
  console.error("Error: --all requires --provider (-p) to be specified.");
  process.exit(1);
}

const cliArgs: CLIArgs | undefined = values.all
  ? {
      provider: values.provider ?? "",
      model: values.model,
      coreOnly: values["core-only"] ?? false,
      daemonOnly: values["daemon-only"] ?? false,
    }
  : undefined;

render(<App cliArgs={cliArgs} />);
