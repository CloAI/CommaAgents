import { useCallback, useState } from "react";
import { Settings, SquarePen } from "lucide-react";
import { IconButton } from "../../design-system/IconButton";
import { useLayout } from "../../hooks/useLayout";
import { SettingsDialog } from "../SettingsDialog";
import styles from "./Sidebar.module.scss";

/**
 * Own the navigation actions and settings dialog for the application rail.
 * @returns {React.ReactElement} The navigation rail and settings dialog while open.
 */
export function Sidebar() {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const { newChat } = useLayout();
  const handleSettings = useCallback(() => setSettingsOpen(true), []);
  const handleCloseSettings = useCallback(() => setSettingsOpen(false), []);

  return (
    <>
      <SidebarRender onNewChat={newChat} onSettings={handleSettings} />
      {settingsOpen && <SettingsDialog onClose={handleCloseSettings} />}
    </>
  );
}

/** Action callbacks for the application icon rail. */
export interface SidebarRenderProps {
  /** Handle the New Chat action. */
  readonly onNewChat: () => void;
  /** Handle the Settings action. */
  readonly onSettings: () => void;
}

/**
 * Keep New Chat at the top and Settings at the bottom of a compact rail.
 * @param {SidebarRenderProps} props - Application action callbacks.
 * @returns {React.ReactElement} The application navigation rail.
 */
export function SidebarRender({ onNewChat, onSettings }: SidebarRenderProps) {
  return (
    <nav className={styles.sidebar} aria-label="Application">
      <IconButton label="New chat" onClick={onNewChat}>
        <SquarePen />
      </IconButton>
      <IconButton label="Settings" onClick={onSettings}>
        <Settings />
      </IconButton>
    </nav>
  );
}
