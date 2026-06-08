// Full application entry — loaded dynamically from main.tsx after the console
// hijack and process error handlers are in place.

import { render } from "ink";
import { MemoryRouter } from "react-router";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";

import { App } from "./App";
import { ChatRunsContextProvider } from "./hooks/useChat";
import { DaemonContextProvider } from "./hooks/useDaemon";
import { logStore } from "./hooks/useLogs/logStore";
import { ModalContextProvider } from "./hooks/useModal";
import { UserConfigContextProvider } from "./hooks/useUserConfig";
import { ThemeContextProvider } from "./Theme";

const argv = yargs(hideBin(process.argv))
  .scriptName("comma-agents-tui")
  .usage("$0 [options]")
  .option("strategy", {
    alias: "s",
    type: "string",
    describe:
      "Strategy name to run (e.g. Plan, Build, or a custom strategy name)",
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
  .option("dev", {
    alias: "D",
    type: "boolean",
    default: false,
    describe: "Enable the component playground (Dev tab, Alt+4)",
  })
  .example("$0", "Interactive strategy picker")
  .example("$0 -s Plan", "Start with the Plan strategy")
  .example(
    "$0 -s Build -i 'Add a login page'",
    "Start Build strategy with initial input",
  )
  .example("$0 --dev", "Open with the component playground enabled")
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
    // Write directly to stderr since console is hijacked by the log store.
    process.stderr.write(
      "Error: comma-agents-tui requires an interactive terminal (TTY).\n" +
        "Run it directly: bun run packages/tui/src/main.tsx\n" +
        "Or from the package dir: cd packages/tui && bun run src/main.tsx\n",
    );
    process.exit(1);
  }
}

const stdin = resolveStdin();

render(
  <MemoryRouter>
    <UserConfigContextProvider>
      <ThemeContextProvider>
        <DaemonContextProvider url={argv.daemonUrl}>
          <ChatRunsContextProvider>
            <ModalContextProvider>
              <App devMode={argv.dev} />
            </ModalContextProvider>
          </ChatRunsContextProvider>
        </DaemonContextProvider>
      </ThemeContextProvider>
    </UserConfigContextProvider>
  </MemoryRouter>,
  {
    stdin,
    // The TUI has its own console capture pipeline (`logStore`). Ink's default
    // console patch would replace those interceptors and print logs above the
    // rendered UI, which makes logs flicker instead of appearing in /logs.
    patchConsole: false,
    incrementalRendering: true,
    concurrent: true,
  },
);

// The app has rendered its first frame — switch the log store from pass-through
// mode to full capture mode. Any console output from here on is only visible
// in the Logs tab, keeping the TUI display clean.
logStore.commit();
