import { act } from "react";
import type { ReactNode } from "react";
import { CommaAgentsDaemonProvider } from "./hooks/useCommaAgentsDaemon";
import { deliver, requests } from "./hooks/useCommaAgentsDaemon/test.utils";
import { LayoutProvider } from "./hooks/useLayout";
import { isolateLayoutStorage } from "./hooks/useLayout/test.utils";
import type { Layout } from "./hooks/useLayout";
import { SettingsProvider } from "./hooks/useSettings";
import { MockWebSocket } from "./hooks/useWebSocket/test.utils";
import { SETTINGS_STORAGE_KEY } from "./settings/settings.constants";

/** The providers every page and pane needs. */
export interface AppProvidersProps {
  /** Route to open in the focused pane at startup. */
  readonly initialPath?: string;
  /** Content to provide for. */
  readonly children: ReactNode;
}

/**
 * Provide settings, the daemon connection, and the layout.
 * @param {AppProvidersProps} props - Component properties.
 * @returns {React.ReactElement} The provider stack.
 */
export function AppProviders({ initialPath, children }: AppProvidersProps) {
  return (
    <SettingsProvider>
      <CommaAgentsDaemonProvider>
        <LayoutProvider initialPath={initialPath}>{children}</LayoutProvider>
      </CommaAgentsDaemonProvider>
    </SettingsProvider>
  );
}

/** What a story starts with. */
export interface StoryFixture {
  /** Saved layout; omitted starts with none. */
  readonly layout?: Layout;
  /** Saved settings record; omitted starts with none. */
  readonly settings?: Readonly<Record<string, unknown>>;
}

/**
 * Replace the browser socket and the saved state for one story.
 * @param {StoryFixture} [fixture] - Saved layout and settings to start with.
 * @returns {() => void} Restores the real socket and saved state.
 */
export function prepareStory(fixture: StoryFixture = {}): () => void {
  MockWebSocket.instances = [];
  const original = globalThis.WebSocket;
  globalThis.WebSocket = MockWebSocket as unknown as typeof WebSocket;
  const previousSettings = localStorage.getItem(SETTINGS_STORAGE_KEY);
  if (fixture.settings === undefined) {
    localStorage.removeItem(SETTINGS_STORAGE_KEY);
  } else {
    localStorage.setItem(
      SETTINGS_STORAGE_KEY,
      JSON.stringify(fixture.settings),
    );
  }
  const restoreLayout = isolateLayoutStorage(fixture.layout);
  return () => {
    globalThis.WebSocket = original;
    restoreLayout();
    if (previousSettings === null) {
      localStorage.removeItem(SETTINGS_STORAGE_KEY);
    } else {
      localStorage.setItem(SETTINGS_STORAGE_KEY, previousSettings);
    }
  };
}

/**
 * Open the daemon connection of the latest mounted provider.
 * @returns {Promise<MockWebSocket>} The open socket.
 */
export async function openSocket(): Promise<MockWebSocket> {
  const socket = MockWebSocket.instances.at(-1)!;
  await act(() => socket.open());
  return socket;
}

/** A strategy as the daemon lists it. */
export interface ListedStrategy {
  readonly name: string;
  readonly label: string;
  readonly version: string;
  readonly path: string;
  readonly origin: "cwd" | "bundled";
}

/**
 * Answer every strategy-list request made so far.
 * @param {MockWebSocket} socket - Open socket.
 * @param {readonly ListedStrategy[]} strategies - Strategies to list.
 * @returns {Promise<void>} Resolves once all are answered.
 */
export async function answerStrategyLists(
  socket: MockWebSocket,
  strategies: readonly ListedStrategy[],
): Promise<void> {
  for (const request of requests(socket, "command").filter(
    (candidate) => candidate.command === "core.strategies.list",
  )) {
    await act(() =>
      deliver(socket, request.requestId, {
        type: "response",
        ok: true,
        data: { strategies, warnings: [] },
      }),
    );
  }
}
