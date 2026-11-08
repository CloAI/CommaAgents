import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App, HostProvider } from "@comma-agents/ui";
import type { HostCapabilities } from "@comma-agents/ui";
import { createIpcSocket } from "./ipc-socket";
import { TitleBar } from "./TitleBar";
import "./renderer.scss";

const { commaDesktop } = window;
const host: HostCapabilities = {
  createSocket: () => createIpcSocket(commaDesktop.daemon),
};

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("The application root element is missing.");
}

createRoot(rootElement).render(
  <StrictMode>
    <HostProvider host={host}>
      <App header={<TitleBar />} />
    </HostProvider>
  </StrictMode>,
);
