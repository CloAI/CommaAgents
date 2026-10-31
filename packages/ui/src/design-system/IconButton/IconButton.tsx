import { Button } from "../Button";
import type { ButtonProps } from "../Button";
import styles from "./IconButton.module.scss";

/** Compact icon action with a required accessible name. */
export interface IconButtonProps extends Omit<ButtonProps, "aria-label"> {
  /** Accessible action name, also used as the default hover title. */
  readonly label: string;
}

/**
 * Render an icon-only action using the shared button behavior.
 * @param {IconButtonProps} props - Icon content and native button options.
 * @returns {React.ReactElement} The compact action.
 */
export function IconButton({
  label,
  children,
  title = label,
  className = "",
  ...buttonProps
}: IconButtonProps) {
  return (
    <Button
      {...buttonProps}
      aria-label={label}
      title={title}
      className={`${styles.iconButton} ${className}`}
    >
      <span aria-hidden="true" className={styles.icon}>
        {children}
      </span>
    </Button>
  );
}
