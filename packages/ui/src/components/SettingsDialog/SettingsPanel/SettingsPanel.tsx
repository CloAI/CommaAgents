import { useId } from "react";
import type { ReactNode } from "react";
import { Button } from "../../../design-system/Button";
import styles from "./SettingsPanel.module.scss";

/** Shared presentation for a section's own content and actions. */
export interface SettingsPanelProps {
  /** Section heading. */
  readonly title: string;
  /** Dismiss the settings modal. */
  readonly onClose: () => void;
  /** Section-owned controls beside the heading. */
  readonly headerActions?: ReactNode;
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
  headerActions,
  feedback,
  footerActions,
  children,
}: SettingsPanelProps) {
  const titleId = useId();
  return (
    <section className={styles.panel} aria-labelledby={titleId}>
      <div className={styles.content}>
        <header className={styles.header}>
          <h3 id={titleId}>{title}</h3>
          {headerActions}
        </header>
        {children}
      </div>
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
