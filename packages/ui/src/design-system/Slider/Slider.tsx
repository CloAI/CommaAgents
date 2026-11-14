import type { ComponentPropsWithRef, CSSProperties } from "react";
import styles from "./Slider.module.scss";

/** A controlled numeric slider; supply an accessible name or an associated label. */
export interface SliderProps extends Omit<
  ComponentPropsWithRef<"input">,
  | "type"
  | "value"
  | "defaultValue"
  | "onChange"
  | "min"
  | "max"
  | "step"
  | "children"
> {
  /** Current numeric value. */
  readonly value: number;
  /** Receives the new value while dragging or using the keyboard. */
  readonly onValueChange: (value: number) => void;
  /** Lowest selectable value. @default 0 */
  readonly min?: number;
  /** Highest selectable value. @default 100 */
  readonly max?: number;
  /** Increment between selectable values. @default 1 */
  readonly step?: number | "any";
}

/**
 * Render a themed range input with native pointer, touch, and keyboard behavior.
 * @param {SliderProps} props - Value, bounds, change handler, and native input options.
 * @returns {React.ReactElement} The themed slider.
 */
export function Slider({
  value,
  onValueChange,
  min = 0,
  max = 100,
  step = 1,
  className = "",
  style,
  ...inputProps
}: SliderProps) {
  const progress =
    max > min
      ? Math.max(0, Math.min(100, ((value - min) / (max - min)) * 100))
      : 0;
  return (
    <input
      {...inputProps}
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={(event) => onValueChange(event.currentTarget.valueAsNumber)}
      className={`${styles.slider} ${className}`}
      style={{ ...style, "--slider-progress": `${progress}%` } as CSSProperties}
    />
  );
}
