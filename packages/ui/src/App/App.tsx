import { useState } from "react";
import type { ReactNode } from "react";
import { DaemonConnectionStatus } from "../components/DaemonConnectionStatus";
import { Sidebar } from "../components/Sidebar";
import { CommaAgentsDaemonProvider } from "../hooks/useCommaAgentsDaemon";
import { LayoutProvider, pathFromHash } from "../hooks/useLayout";
import { SettingsProvider } from "../hooks/useSettings";
import { ThemeProvider } from "../hooks/useTheme";
import { Workspace } from "../components/Workspace";
import styles from "./App.module.scss";

/** Optional chrome supplied by the host application. */
export interface AppProps {
  /** Header shown above the workspace; give it a height through `--header-height`. */
  readonly header?: ReactNode;
}

/**
 * Initialize the application's screen composition.
 * @param {AppProps} props - Optional host chrome.
 * @returns {React.ReactElement} The rendered component.
 */
export function App({ header }: AppProps) {
  // The route in the address bar at launch opens in the focused pane.
  const [initialPath] = useState(() => pathFromHash(window.location.hash));

  return (
    <SettingsProvider>
      <ThemeProvider>
        <CommaAgentsDaemonProvider>
          <LayoutProvider initialPath={initialPath}>
            <AppRender
              header={header}
              connectionStatus={<DaemonConnectionStatus />}
            />
          </LayoutProvider>
        </CommaAgentsDaemonProvider>
      </ThemeProvider>
    </SettingsProvider>
  );
}

/** Content for the application shell. */
export interface AppRenderProps {
  /** Host-supplied header above the workspace. */
  readonly header?: ReactNode;
  /** Connection indicator anchored at the bottom-right edge. */
  readonly connectionStatus: ReactNode;
}

/**
 * Arrange the compact application rail beside the current screen.
 * @param {AppRenderProps} props - Application shell content.
 * @returns {React.ReactElement} The application shell.
 */
export function AppRender({ header, connectionStatus }: AppRenderProps) {
  return (
    <div className={styles.app}>
      {header}
      <div className={styles.body}>
        <Sidebar />
        <div className={styles.content}>
          <Workspace />
        </div>
      </div>
      <div className={styles.connectionStatus}>{connectionStatus}</div>
    </div>
  );
}
