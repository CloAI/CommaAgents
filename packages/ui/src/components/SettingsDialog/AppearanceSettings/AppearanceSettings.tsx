import { useState } from "react";
import { Button } from "../../../design-system/Button";
import { Select } from "../../../design-system/Select";
import { useTheme } from "../../../hooks/useTheme";
import { cloneTheme, isCustomThemeId, paletteFor } from "../../../theme";
import type { Theme, ThemeMode } from "../../../theme";
import { SettingsPanel } from "../SettingsPanel";
import { ThemeEditor } from "./ThemeEditor";
import { ThemePreview } from "./ThemePreview";
import styles from "./AppearanceSettings.module.scss";

/** Settings modal dismissal. */
export interface AppearanceSettingsProps {
  /** Close the settings modal. */
  readonly onClose: () => void;
}

/** A draft being edited, and whether it is a brand-new copy. */
interface Editing {
  /** Theme as edited so far. */
  readonly draft: Theme;
  /** Palette shown in the editor. */
  readonly mode: ThemeMode;
}

/**
 * Pick a theme and mode, and create, edit, or delete custom themes.
 *
 * Choosing a theme or mode applies and saves at once; custom theme edits save with the button.
 * @param {AppearanceSettingsProps} props - Dismissal callback.
 * @returns {React.ReactElement} The appearance section.
 */
export function AppearanceSettings({ onClose }: AppearanceSettingsProps) {
  const {
    theme,
    mode,
    themes,
    setMode,
    selectTheme,
    saveCustomTheme,
    deleteCustomTheme,
  } = useTheme();
  const [editing, setEditing] = useState<Editing>();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string>();
  const report = (result: {
    readonly type: string;
    readonly message?: string;
  }) => setError(result.type === "error" ? result.message : undefined);
  const custom = isCustomThemeId(theme.id);
  const startEditing = (source: Theme, copy: boolean) =>
    setEditing({
      draft: copy
        ? cloneTheme(
            source,
            `custom-${crypto.randomUUID()}`,
            `${source.name} copy`,
          )
        : source,
      mode,
    });
  const save = () => {
    if (!editing) {
      return;
    }
    const name = editing.draft.name.trim();
    if (name === "") {
      setError("Enter a theme name.");
      return;
    }
    const result = saveCustomTheme({ ...editing.draft, name });
    report(result);
    if (result.type === "success") {
      setEditing(undefined);
    }
  };
  return (
    <SettingsPanel
      title="Appearance"
      onClose={onClose}
      feedback={error && <span role="alert">{error}</span>}
      footerActions={
        editing ? (
          <>
            <Button
              onClick={() => {
                setEditing(undefined);
                setError(undefined);
              }}
            >
              Discard
            </Button>
            <Button onClick={save}>Save theme</Button>
          </>
        ) : undefined
      }
    >
      {editing ? (
        <ThemeEditor
          draft={editing.draft}
          mode={editing.mode}
          onChange={(draft) => setEditing({ ...editing, draft })}
          onModeChange={(next) => setEditing({ ...editing, mode: next })}
        />
      ) : (
        <div className={styles.editor}>
          <div className={styles.field}>
            <span id="theme-label">Theme</span>
            <Select
              label="Theme"
              placeholder="Choose a theme"
              value={theme.id}
              options={themes.map((entry) => ({
                value: entry.id,
                label: entry.name,
                group: isCustomThemeId(entry.id) ? "Custom" : "Built in",
              }))}
              groupOrder={["Built in", "Custom"]}
              onChange={(id) => {
                setConfirmDelete(false);
                report(selectTheme(id));
              }}
            />
          </div>
          <div className={styles.modes} role="group" aria-label="Mode">
            {(["dark", "light"] as const).map((entry) => (
              <Button
                key={entry}
                aria-pressed={mode === entry}
                onClick={() => report(setMode(entry))}
              >
                {entry === "dark" ? "Dark" : "Light"}
              </Button>
            ))}
          </div>
          <div className={styles.actions}>
            {custom && (
              <Button onClick={() => startEditing(theme, false)}>Edit</Button>
            )}
            <Button onClick={() => startEditing(theme, true)}>
              {custom ? "Duplicate" : "Customize copy"}
            </Button>
            {custom && !confirmDelete && (
              <Button onClick={() => setConfirmDelete(true)}>Delete</Button>
            )}
            {custom && confirmDelete && (
              <>
                <span>Delete “{theme.name}”?</span>
                <Button
                  onClick={() => {
                    setConfirmDelete(false);
                    report(deleteCustomTheme(theme.id));
                  }}
                >
                  Confirm delete
                </Button>
                <Button onClick={() => setConfirmDelete(false)}>Keep</Button>
              </>
            )}
          </div>
          <ThemePreview palette={paletteFor(theme, mode)} />
        </div>
      )}
    </SettingsPanel>
  );
}
