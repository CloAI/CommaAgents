import type { ComponentPropsWithoutRef } from "react";
import styles from "./TextArea.module.scss";

/** Native textarea options; callers provide an accessible name when needed. */
export type TextAreaProps = ComponentPropsWithoutRef<"textarea">;

/**
 * Render a multiline field using the shared input styles.
 * @param {TextAreaProps} props - Component properties.
 * @returns {React.ReactElement} The rendered component.
 */
export function TextArea({ className = "", ...textAreaProps }: TextAreaProps) {
  return (
    <textarea
      {...textAreaProps}
      className={`${styles.textArea} ${className}`}
    />
  );
}
