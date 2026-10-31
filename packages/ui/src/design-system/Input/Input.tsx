import type { ComponentPropsWithRef } from "react";
import styles from "./Input.module.scss";

/** Native single-line input options; callers supply the accessible name. */
export type InputProps = ComponentPropsWithRef<"input">;

/**
 * Render a compact single-line field using the shared input styles.
 * @param {InputProps} props - Native input properties and optional ref.
 * @returns {React.ReactElement} The styled input.
 */
export function Input({
  className = "",
  type = "text",
  ...inputProps
}: InputProps) {
  return (
    <input
      {...inputProps}
      type={type}
      className={`${styles.input} ${className}`}
    />
  );
}
