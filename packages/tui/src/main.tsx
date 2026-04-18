import { render } from "ink";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";

import { App } from "./app";
import { DaemonProvider } from "./hooks/useDaemon";
import { ThemeProvider } from "./theme";

const argv = yargs(hideBin(process.argv))
  .scriptName("comma-agents-tui")
  .usage("$0 [options]")
  .option("strategy", {
    alias: "s",
    type: "string",
    describe: "Strategy to run (plan, build)",
    choices: ["plan", "build"],
  })
  .option("daemon-url", {
    alias: "d",
    type: "string",
    describe: "Daemon WebSocket URL",
    default: "ws://localhost:7422/ws",
  })
  .option("input", {
    alias: "i",
    type: "string",
    describe: "Initial input message (skips first user prompt)",
  })
  .example("$0", "Interactive strategy picker")
  .example("$0 -s plan", "Start with the Plan strategy")
  .example("$0 -s build -i 'Add a login page'", "Start Build with initial input")
  .strict()
  .help()
  .alias("h", "help")
  .version(false)
  .parseSync();

// Ink requires a TTY for raw-mode keyboard input. When stdin is not a TTY
// (e.g. piped, run via `bun run --filter`, or in CI), try to open /dev/tty
// as a fallback. If that also fails, bail with a helpful message.
function resolveStdin(): NodeJS.ReadStream | import("node:tty").ReadStream {
  if (process.stdin.isTTY) {
    return process.stdin;
  }
  try {
    const nodeFs = require("node:fs") as typeof import("node:fs");
    const { ReadStream } = require("node:tty") as typeof import("node:tty");
    const fileDescriptor = nodeFs.openSync("/dev/tty", "r");
    return new ReadStream(fileDescriptor);
  } catch {
    // No TTY available at all — cannot run interactively.
    console.error(
      "Error: comma-agents-tui requires an interactive terminal (TTY).\n" +
        "Run it directly: bun run packages/tui/src/main.tsx\n" +
        "Or from the package dir: cd packages/tui && bun run src/main.tsx",
    );
    process.exit(1);
  }
}

const stdin = resolveStdin();

render(
  <ThemeProvider>
    <DaemonProvider url={argv.daemonUrl}>
      <App strategy={argv.strategy} initialInput={argv.input} />
    </DaemonProvider>
  </ThemeProvider>,
  { stdin },
);
