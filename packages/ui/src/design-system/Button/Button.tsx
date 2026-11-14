import type { ComponentPropsWithoutRef, ReactNode } from "react";
import styles from "./Button.module.scss";

/** Native button options for the primary design-system action. */
export interface ButtonProps extends ComponentPropsWithoutRef<"button"> {
  /** Visible action label or other accessible button content. */
  readonly children?: ReactNode;
  /** Prevent activation while an action is unavailable. @default false */
  readonly disabled?: boolean;
  /** Native form behavior. @default "button" */
  readonly type?: "button" | "submit" | "reset";
}

/**
 * Render a keyboard-accessible action with shared interaction and disabled styles.
 * @param {ButtonProps} props - Component properties.
 * @returns {React.ReactElement} The rendered component.
 */
export function Button({
  className = "",
  type = "button",
  ...buttonProps
}: ButtonProps) {
  return (
    <button
      {...buttonProps}
      type={type}
      className={`${styles.button} ${className}`}
    />
  );
}
