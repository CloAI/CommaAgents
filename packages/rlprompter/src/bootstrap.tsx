// Full application entry — dynamically imported from main.tsx after process
// error handlers are installed. Parses CLI args, restores providers, resolves a
// TTY, and renders the Ink app inside the provider stack.

import { render } from "ink";
import { MemoryRouter } from "react-router";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import { App } from "./App";
import { ExperimentProvider } from "./hooks/useExperiment";
import { initProviders } from "./runtime/init-providers";
import { ThemeProvider } from "./theme";

const argv = yargs(hideBin(process.argv))
  .scriptName("rlprompter")
  .usage("$0 [options]")
  .option("root", {
    alias: "r",
    type: "string",
    describe: "Directory where experiments are stored",
    default: ".rlprompter",
  })
  .example("$0", "Open the experiment picker")
  .example("$0 --root ./experiments", "Use a custom experiments directory")
  .strict()
  .help()
  .alias("h", "help")
  .version(false)
  .parseSync();

// Restore the global credential + provider registries so in-process strategy
// runs can resolve their models (shared with the daemon's configuration).
await initProviders();

// Ink requires a TTY for raw-mode keyboard input. Fall back to /dev/tty when
// stdin is not a TTY (piped, run via `bun run --filter`, CI).
function resolveStdin(): NodeJS.ReadStream | import("node:tty").ReadStream {
  if (process.stdin.isTTY) return process.stdin;
  try {
    const nodeFs = require("node:fs") as typeof import("node:fs");
    const { ReadStream } = require("node:tty") as typeof import("node:tty");
    return new ReadStream(nodeFs.openSync("/dev/tty", "r"));
  } catch {
    process.stderr.write(
      "Error: rlprompter requires an interactive terminal (TTY).\n" +
        "Run it directly: bun run packages/rlprompter/src/main.tsx\n",
    );
    process.exit(1);
  }
}

render(
  <MemoryRouter>
    <ThemeProvider>
      <ExperimentProvider rootDir={argv.root}>
        <App />
      </ExperimentProvider>
    </ThemeProvider>
  </MemoryRouter>,
  {
    stdin: resolveStdin(),
    patchConsole: false,
    incrementalRendering: true,
  },
);
