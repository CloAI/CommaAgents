import { useCallback, useState } from "react";
import type { ReactNode } from "react";
import { Button } from "../../design-system/Button";
import { Modal } from "../../design-system/Modal";
import { ProvidersSettings } from "./ProvidersSettings";
import { GeneralSettings } from "./GeneralSettings";
import { AppearanceSettings } from "./AppearanceSettings";
import { SettingsPanel } from "./SettingsPanel";
import { SETTINGS_SECTIONS } from "./SettingsDialog.constants";
import type { SettingsSection } from "./SettingsDialog.types";
import styles from "./SettingsDialog.module.scss";

/** Dismissal callback for the settings editor. */
export interface SettingsDialogProps {
  /** Close the dialog and discard its unsaved drafts. */
  readonly onClose: () => void;
}

/**
 * Own only the settings modal, section navigation, and dismissal.
 *
 * Architectural boundary: keep settings details inside their respective section
 * components. Do not add fields, drafts, validation, persistence, section actions,
 * or child dialogs here, or pass those details through SettingsDialogRender.
 *
 * @param {SettingsDialogProps} props - Modal dismissal callback.
 * @returns {React.ReactElement} The settings shell and selected section.
 */
export function SettingsDialog({ onClose }: SettingsDialogProps) {
  const [section, setSection] = useState<SettingsSection>("general");
  const handleSectionChange = useCallback(
    (nextSection: SettingsSection) => setSection(nextSection),
    [],
  );
  const sectionLabel = SETTINGS_SECTIONS.find(
    (entry) => entry.id === section,
  )!.label;
  return (
    <SettingsDialogRender
      onClose={onClose}
      section={section}
      onSectionChange={handleSectionChange}
    >
      {/* Keep the general draft mounted across section changes; the section owns it. */}
      <div hidden={section !== "general"} className={styles.section}>
        <GeneralSettings active={section === "general"} onClose={onClose} />
      </div>
      {section === "providers" && <ProvidersSettings onClose={onClose} />}
      {section === "appearance" && <AppearanceSettings onClose={onClose} />}
      {section !== "general" &&
        section !== "providers" &&
        section !== "appearance" && (
          <SettingsPanel title={sectionLabel} onClose={onClose}>
            <p className={styles.placeholder}>
              No settings are available in this section yet.
            </p>
          </SettingsPanel>
        )}
    </SettingsDialogRender>
  );
}

/** Modal shell state, independent of any section's settings details. */
export interface SettingsDialogRenderProps extends SettingsDialogProps {
  /** Currently selected section. */
  readonly section: SettingsSection;
  /** Select a section. */
  readonly onSectionChange: (section: SettingsSection) => void;
  /** Section components own their fields, actions, and dialogs. */
  readonly children: ReactNode;
}

/**
 * Render only the modal shell and section navigation.
 * @param {SettingsDialogRenderProps} props - Navigation, dismissal, and section content.
 * @returns {React.ReactElement} The fixed-height settings modal.
 */
export function SettingsDialogRender({
  onClose,
  section,
  onSectionChange,
  children,
}: SettingsDialogRenderProps) {
  const sectionLabel = SETTINGS_SECTIONS.find(
    (entry) => entry.id === section,
  )!.label;
  return (
    <Modal
      open
      title={`Settings / ${sectionLabel}`}
      onClose={onClose}
      className={styles.modal}
    >
      <div className={styles.workspace}>
        <nav className={styles.menu} aria-label="Settings sections">
          {SETTINGS_SECTIONS.map((entry) => (
            <Button
              className={styles.sectionButton}
              key={entry.id}
              aria-current={section === entry.id ? "true" : undefined}
              onClick={() => onSectionChange(entry.id)}
            >
              {entry.label}
            </Button>
          ))}
        </nav>
        <div className={styles.sections}>{children}</div>
      </div>
    </Modal>
  );
}
