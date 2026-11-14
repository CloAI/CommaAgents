import { useId } from "react";
import { Button } from "../../../design-system/Button";
import { Input } from "../../../design-system/Input";
import {
  THEME_COLOR_FIELDS,
  THEME_COLOR_GROUPS,
  THEME_COLOR_KEYS,
  isHexColor,
  paletteFor,
  withColor,
  withPalette,
} from "../../../theme";
import type { Theme, ThemeColorKey, ThemeMode } from "../../../theme";
import { ThemePreview } from "./ThemePreview";
import styles from "./AppearanceSettings.module.scss";

/** A theme being edited and the mode whose colors are shown. */
export interface ThemeEditorProps {
  /** Draft theme, not yet saved. */
  readonly draft: Theme;
  /** Mode whose palette is being edited. */
  readonly mode: ThemeMode;
  /** Change the draft. */
  readonly onChange: (draft: Theme) => void;
  /** Edit the other mode's palette. */
  readonly onModeChange: (mode: ThemeMode) => void;
}

/**
 * Edit a theme's name and every color, with a live sample.
 * @param {ThemeEditorProps} props - Draft, mode, and callbacks.
 * @returns {React.ReactElement} The editor fields.
 */
export function ThemeEditor({
  draft,
  mode,
  onChange,
  onModeChange,
}: ThemeEditorProps) {
  const nameId = useId();
  const palette = paletteFor(draft, mode);
  const setColor = (key: ThemeColorKey, color: string) =>
    onChange(withPalette(draft, mode, withColor(palette, key, color)));
  return (
    <div className={styles.editor}>
      <div className={styles.field}>
        <label htmlFor={nameId}>Theme name</label>
        <Input
          id={nameId}
          value={draft.name}
          maxLength={40}
          onChange={(event) => onChange({ ...draft, name: event.target.value })}
        />
      </div>
      <div className={styles.modes} role="group" aria-label="Palette to edit">
        {(["dark", "light"] as const).map((entry) => (
          <Button
            key={entry}
            aria-pressed={mode === entry}
            onClick={() => onModeChange(entry)}
          >
            {entry === "dark" ? "Dark palette" : "Light palette"}
          </Button>
        ))}
      </div>
      <ThemePreview palette={palette} />
      {THEME_COLOR_GROUPS.map((group) => (
        <fieldset key={group} className={styles.group}>
          <legend>{group}</legend>
          {THEME_COLOR_KEYS.filter(
            (key) => THEME_COLOR_FIELDS[key].group === group,
          ).map((key) => (
            <ColorField
              key={key}
              colorKey={key}
              value={palette[key]}
              onChange={setColor}
            />
          ))}
        </fieldset>
      ))}
    </div>
  );
}

/** One color's picker and hex entry. */
interface ColorFieldProps {
  /** Color being edited. */
  readonly colorKey: ThemeColorKey;
  /** Current `#rrggbb` value. */
  readonly value: string;
  /** Receive a valid new value. */
  readonly onChange: (key: ThemeColorKey, color: string) => void;
}

/**
 * Pair a native color picker with a hex field that only accepts valid colors.
 * @param {ColorFieldProps} props - Color identity, value, and callback.
 * @returns {React.ReactElement} The color row.
 */
function ColorField({ colorKey, value, onChange }: ColorFieldProps) {
  const { label, description } = THEME_COLOR_FIELDS[colorKey];
  return (
    <div className={styles.colorField}>
      <input
        type="color"
        className={styles.swatch}
        aria-label={`${label} color`}
        value={value}
        onChange={(event) => onChange(colorKey, event.target.value)}
      />
      <div className={styles.colorText}>
        <span>{label}</span>
        <span className={styles.hint}>{description}</span>
      </div>
      <Input
        className={styles.hex}
        aria-label={`${label} hex`}
        // A key resets the draft text when the picker changes the value.
        key={value}
        defaultValue={value}
        spellCheck={false}
        maxLength={7}
        onChange={(event) => {
          if (isHexColor(event.target.value)) {
            onChange(colorKey, event.target.value.toLowerCase());
          }
        }}
      />
    </div>
  );
}
