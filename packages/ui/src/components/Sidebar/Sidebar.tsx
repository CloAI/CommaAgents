import { Settings, SquarePen } from "lucide-react";
import { IconButton } from "../../design-system/IconButton";
import styles from "./Sidebar.module.scss";

/** Action callbacks for the application icon rail. */
export interface SidebarProps {
  /** Handle the New Chat action. */
  readonly onNewChat: () => void;
  /** Handle the Settings action. */
  readonly onSettings: () => void;
}

/**
 * Keep New Chat at the top and Settings at the bottom of a compact rail.
 * @param {SidebarProps} props - Application action callbacks.
 * @returns {React.ReactElement} The application navigation rail.
 */
export function Sidebar({ onNewChat, onSettings }: SidebarProps) {
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
