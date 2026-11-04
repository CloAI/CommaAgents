import { useState } from "react";
import type { ReactNode } from "react";
import { DaemonConnectionStatus } from "../components/DaemonConnectionStatus";
import { Sidebar } from "../components/Sidebar";
import { CommaAgentsDaemonProvider } from "../hooks/useCommaAgentsDaemon";
import { LayoutProvider, pathFromHash } from "../hooks/useLayout";
import { SettingsProvider } from "../hooks/useSettings";
import { Workspace } from "../components/Workspace";
import styles from "./App.module.scss";

/**
 * Initialize the application's screen composition.
 * @returns {React.ReactElement} The rendered component.
 */
export function App() {
  // The route in the address bar at launch opens in the focused pane.
  const [initialPath] = useState(() => pathFromHash(window.location.hash));

  return (
    <SettingsProvider>
      <CommaAgentsDaemonProvider>
        <LayoutProvider initialPath={initialPath}>
          <AppRender connectionStatus={<DaemonConnectionStatus />} />
        </LayoutProvider>
      </CommaAgentsDaemonProvider>
    </SettingsProvider>
  );
}

/** Content for the application shell. */
export interface AppRenderProps {
  /** Connection indicator anchored at the bottom-right edge. */
  readonly connectionStatus: ReactNode;
}

/**
 * Arrange the compact application rail beside the current screen.
 * @param {AppRenderProps} props - Application shell content.
 * @returns {React.ReactElement} The application shell.
 */
export function AppRender({ connectionStatus }: AppRenderProps) {
  return (
    <div className={styles.app}>
      <Sidebar />
      <div className={styles.content}>
        <Workspace />
      </div>
      <div className={styles.connectionStatus}>{connectionStatus}</div>
    </div>
  );
}
