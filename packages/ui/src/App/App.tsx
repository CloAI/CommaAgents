import { useCallback, useState } from "react";
import type { ReactNode } from "react";
import { DaemonConnectionStatus } from "../components/DaemonConnectionStatus";
import { Sidebar } from "../components/Sidebar";
import { SettingsDialog } from "../components/SettingsDialog";
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
  const [settingsOpen, setSettingsOpen] = useState(false);
  // The route in the address bar at launch opens in the focused pane.
  const [initialPath] = useState(() => pathFromHash(window.location.hash));
  const handleNewChat = useCallback(
    () => window.alert("New chat is not available yet."),
    [],
  );
  const handleSettings = useCallback(() => setSettingsOpen(true), []);
  const handleCloseSettings = useCallback(() => setSettingsOpen(false), []);

  return (
    <SettingsProvider>
      <CommaAgentsDaemonProvider>
        <LayoutProvider initialPath={initialPath}>
          <AppRender
            onNewChat={handleNewChat}
            onSettings={handleSettings}
            connectionStatus={<DaemonConnectionStatus />}
            settingsDialog={
              settingsOpen ? (
                <SettingsDialog onClose={handleCloseSettings} />
              ) : undefined
            }
          />
        </LayoutProvider>
      </CommaAgentsDaemonProvider>
    </SettingsProvider>
  );
}

/** Local action handlers for the application shell. */
export interface AppRenderProps {
  /** Handle the New Chat action. */
  readonly onNewChat: () => void;
  /** Handle the Settings action. */
  readonly onSettings: () => void;
  /** Connection indicator anchored at the bottom-right edge. */
  readonly connectionStatus: ReactNode;
  /** Settings editor rendered while open. */
  readonly settingsDialog?: ReactNode;
}

/**
 * Arrange the compact application rail beside the current screen.
 * @param {AppRenderProps} props - Application action handlers.
 * @returns {React.ReactElement} The application shell.
 */
export function AppRender({
  onNewChat,
  onSettings,
  settingsDialog,
  connectionStatus,
}: AppRenderProps) {
  return (
    <div className={styles.app}>
      <Sidebar onNewChat={onNewChat} onSettings={onSettings} />
      <div className={styles.content}>
        <Workspace />
      </div>
      <div className={styles.connectionStatus}>{connectionStatus}</div>
      {settingsDialog}
    </div>
  );
}
