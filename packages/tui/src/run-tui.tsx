import { openSync } from "node:fs";
import { ReadStream } from "node:tty";
import { render } from "ink";
import { MemoryRouter } from "react-router";
import { App } from "./App";
import { ChatRunsContextProvider } from "./hooks/useChat";
import { DaemonContextProvider } from "./hooks/useDaemon";
import { logStore } from "./hooks/useLogs/logStore";
import { McpContextProvider } from "./hooks/useMcp";
import { ModalContextProvider } from "./hooks/useModal";
import { StrategyDiscoveryContextProvider } from "./hooks/useStrategies";
import { UserConfigContextProvider } from "./hooks/useUserConfig";
import type { RunTuiOptions, TuiInstance } from "./run-tui.types";
import { ThemeContextProvider } from "./Theme";

function resolveStdin(): NodeJS.ReadStream | ReadStream {
  if (process.stdin.isTTY) {
    return process.stdin;
  }

  try {
    return new ReadStream(openSync("/dev/tty", "r"));
  } catch {
    process.stderr.write(
      "Error: comma requires an interactive terminal (TTY).\n",
    );
    process.exit(1);
  }
}

/**
 * Render the CommaAgents terminal interface against a daemon WebSocket URL.
 *
 * @param options - Initial strategy, prompt, daemon URL, and development mode.
 * @example
 * ```ts
 * const tui = runTui({ strategy: "Plan", input: "Review this repo" });
 * await tui.waitUntilExit();
 * ```
 */
export function runTui({
  daemonUrl = "ws://localhost:7422/ws",
  dev = false,
}: RunTuiOptions = {}): TuiInstance {
  const tuiInstance = render(
    <MemoryRouter>
      <UserConfigContextProvider>
        <ThemeContextProvider>
          <DaemonContextProvider url={daemonUrl}>
            <McpContextProvider>
              <StrategyDiscoveryContextProvider>
                <ChatRunsContextProvider>
                  <ModalContextProvider>
                    <App devMode={dev} />
                  </ModalContextProvider>
                </ChatRunsContextProvider>
              </StrategyDiscoveryContextProvider>
            </McpContextProvider>
          </DaemonContextProvider>
        </ThemeContextProvider>
      </UserConfigContextProvider>
    </MemoryRouter>,
    {
      stdin: resolveStdin(),
      patchConsole: false,
      incrementalRendering: true,
      concurrent: true,
    },
  );

  logStore.commit();
  return tuiInstance;
}
