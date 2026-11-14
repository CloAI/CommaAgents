import type { ReactNode } from "react";
import { Button } from "../../../design-system/Button";
import styles from "./SettingsPanel.module.scss";

/** Shared presentation for a section's own content and actions. */
export interface SettingsPanelProps {
  /** Accessible section name; the modal header shows the visible title. */
  readonly title: string;
  /** Dismiss the settings modal. */
  readonly onClose: () => void;
  /** Section-owned save or validation feedback. */
  readonly feedback?: ReactNode;
  /** Section-owned actions beside Cancel. */
  readonly footerActions?: ReactNode;
  /** Section-owned fields and content. */
  readonly children: ReactNode;
}

/**
 * Keep section content scrollable while its dismissal and actions stay visible.
 * @param {SettingsPanelProps} props - Presentation slots owned by the section.
 * @returns {React.ReactElement} The shared section frame.
 */
export function SettingsPanel({
  title,
  onClose,
  feedback,
  footerActions,
  children,
}: SettingsPanelProps) {
  return (
    <section className={styles.panel} aria-label={title}>
      <div className={styles.content}>{children}</div>
      <footer className={styles.footer}>
        <div className={styles.feedback}>{feedback}</div>
        <Button className={styles.cancel} onClick={onClose}>
          Cancel
        </Button>
        {footerActions}
      </footer>
    </section>
  );
}
