import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App, HostProvider } from "@comma-agents/ui";
import type { HostCapabilities } from "@comma-agents/ui";
import { createIpcSocket } from "./ipc-socket";
import { TitleBar } from "./TitleBar";
import "./renderer.scss";

const { commaDesktop } = window;
const listeners = new Set<() => void>();
let snapshot: Awaited<ReturnType<typeof commaDesktop.workspace.get>>;
let receivedUpdate = false;
commaDesktop.workspace.onChanged((next) => {
  receivedUpdate = true;
  snapshot = next;
  for (const listener of listeners) {
    listener();
  }
});
const host: HostCapabilities = {
  chooseDirectory: (initialDirectory) =>
    commaDesktop.chooseDirectory(initialDirectory),
  workspace: {
    getSnapshot: () => snapshot,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    send: (command) => commaDesktop.workspace.send(command),
    ready: () => commaDesktop.workspace.ready(),
  },
  createSocket: () => createIpcSocket(commaDesktop.daemon),
  desktopSettings: commaDesktop.settings,
};

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("The application root element is missing.");
}

async function start() {
  const initial = await commaDesktop.workspace.get();
  if (!receivedUpdate) {
    snapshot = initial;
  }
  createRoot(rootElement!).render(
    <StrictMode>
      <HostProvider host={host}>
        <App header={<TitleBar />} />
      </HostProvider>
    </StrictMode>,
  );
}
void start();
