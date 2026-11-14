import { useFocusedPaneTitle } from "@comma-agents/ui";
import { usePlatform } from "../usePlatform";
import styles from "./TitleBar.module.scss";
import { WindowControls } from "./WindowControls";
import { WindowAppearanceControls } from "./WindowAppearanceControls";

/**
 * Window header: drags the window, names the focused pane, and holds the window controls.
 * @returns {React.ReactElement} The title bar.
 */
export function TitleBar() {
  const title = useFocusedPaneTitle();
  const mac = usePlatform() === "darwin";
  return (
    <header className={styles.titleBar}>
      <div className={styles.side}>{mac && <WindowControls />}</div>
      <span className={styles.title}>{title}</span>
      <div className={`${styles.side} ${styles.end}`}>
        <WindowAppearanceControls />
        {!mac && <WindowControls />}
      </div>
    </header>
  );
}
