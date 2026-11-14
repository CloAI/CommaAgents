import type { ComponentPropsWithoutRef } from "react";
import styles from "./Switch.module.scss";

/** A labelled on/off control; label it with `aria-label` or `aria-labelledby`. */
export interface SwitchProps extends Omit<
  ComponentPropsWithoutRef<"button">,
  "role" | "type" | "children" | "onChange"
> {
  /** Whether the setting is on. */
  readonly checked: boolean;
  /** Receives the requested new value when the switch is activated. */
  readonly onCheckedChange: (checked: boolean) => void;
  /** Prevent activation while the setting is unavailable. @default false */
  readonly disabled?: boolean;
}

/**
 * Render a keyboard-accessible switch that reports its state to assistive technology.
 * @param {SwitchProps} props - Component properties.
 * @returns {React.ReactElement} The rendered component.
 */
export function Switch({
  checked,
  onCheckedChange,
  className = "",
  ...buttonProps
}: SwitchProps) {
  return (
    <button
      {...buttonProps}
      type="button"
      role="switch"
      aria-checked={checked}
      className={`${styles.switch} ${className}`}
      onClick={() => onCheckedChange(!checked)}
    >
      <span className={styles.thumb} aria-hidden="true" />
    </button>
  );
}
